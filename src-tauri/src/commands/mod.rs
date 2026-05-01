use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

use crate::cache;
use crate::sidecar::{JobId, SidecarManager};
use crate::types::{AudioFormat, DeviceInfo, LibraryEntry, SidecarEvent, StemName};

pub struct AppState {
    pub sidecar: SidecarManager,
}

impl AppState {
    pub fn new() -> Self {
        Self { sidecar: SidecarManager::new() }
    }
}

fn err_string<E: std::fmt::Display>(e: E) -> String { e.to_string() }

#[tauri::command]
pub async fn process_url(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    url: String,
) -> Result<JobId, String> {
    let cache_dir = cache::cache_dir(&app).map_err(err_string)?;
    let cache_dir_str = cache_dir.to_string_lossy().into_owned();
    // `--cache-dir` is a global flag and must precede the `process` subcommand
    // for argparse on the sidecar side. It also pins the cache root to match
    // where `export_stems` looks up `{cache_key}/{stem}.wav`.
    let args = vec![
        "--cache-dir".into(),
        cache_dir_str.clone(),
        "process".into(),
        "--url".into(),
        url,
        "--output-dir".into(),
        cache_dir_str,
    ];
    state.sidecar.spawn(app, args).map_err(err_string)
}

#[tauri::command]
pub async fn cancel_job(
    state: State<'_, Arc<AppState>>,
    job_id: String,
) -> Result<(), String> {
    state.sidecar.cancel(&job_id).map_err(err_string)
}

#[tauri::command]
pub async fn prefetch_model(app: AppHandle) -> Result<(), String> {
    SidecarManager::run_prefetch(app, vec!["prefetch-model".into()])
        .await
        .map_err(err_string)
}

#[tauri::command]
pub async fn get_device_info(app: AppHandle) -> Result<DeviceInfo, String> {
    let events = SidecarManager::run_oneshot(app, vec!["device-info".into()])
        .await
        .map_err(err_string)?;
    for ev in events {
        if let SidecarEvent::DeviceInfo { available, selected, details, .. } = ev {
            return Ok(DeviceInfo { available, selected, details });
        }
    }
    Err("sidecar produced no device_info event".into())
}

#[tauri::command]
pub async fn clear_cache(app: AppHandle) -> Result<(), String> {
    let dir = cache::cache_dir(&app).map_err(err_string)?;
    cache::clear(&dir).map_err(err_string)
}

#[tauri::command]
pub async fn get_cache_size(app: AppHandle) -> Result<u64, String> {
    let dir = cache::cache_dir(&app).map_err(err_string)?;
    Ok(cache::dir_size_bytes(&dir))
}

#[tauri::command]
pub async fn list_cache_entries(app: AppHandle) -> Result<Vec<LibraryEntry>, String> {
    let dir = cache::cache_dir(&app).map_err(err_string)?;
    Ok(cache::list_entries(&dir))
}

#[tauri::command]
pub async fn touch_cache_entry(app: AppHandle, cache_key: String) -> Result<(), String> {
    let dir = cache::cache_dir(&app).map_err(err_string)?;
    cache::touch_entry(&dir, &cache_key).map_err(err_string)
}

#[tauri::command]
pub async fn read_audio_bytes(
    app: AppHandle,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    // Confina leitura ao cache da app — frontend não tem motivo pra ler
    // arquivos arbitrários, e Response pula CSP/asset protocol que falham
    // pra fetch() em alguns paths/builds.
    let cache_root = cache::cache_dir(&app).map_err(err_string)?;
    let canonical_root = std::fs::canonicalize(&cache_root).map_err(err_string)?;
    let canonical_path = std::fs::canonicalize(&path).map_err(err_string)?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!("path fora do cache: {}", path));
    }
    let bytes = std::fs::read(&canonical_path).map_err(err_string)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportArgs {
    pub job_id: JobId,
    pub selected_stems: Vec<StemName>,
    pub format: AudioFormat,
    pub output_path: PathBuf,
    #[serde(default)]
    pub as_zip: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub written: Vec<PathBuf>,
}

#[tauri::command]
pub async fn export_stems(
    app: AppHandle,
    args: ExportArgs,
) -> Result<ExportResult, String> {
    use std::fs;

    let cache_dir = cache::cache_dir(&app).map_err(err_string)?;
    // The frontend passes the cache_key from the sidecar's `complete` event as job_id here.
    let job_dir = cache_dir.join(&args.job_id);
    if !job_dir.exists() {
        return Err(format!("cache miss for job {}", args.job_id));
    }

    let mut written = Vec::new();

    for stem in &args.selected_stems {
        let stem_str = stem.as_str();
        let src = job_dir.join(format!("{stem_str}.wav"));
        if !src.exists() {
            return Err(format!("stem missing: {}", src.display()));
        }
        match &args.format {
            AudioFormat::Wav if !args.as_zip => {
                let dst = args.output_path.join(format!("{stem_str}.wav"));
                fs::copy(&src, &dst).map_err(err_string)?;
                written.push(dst);
            }
            AudioFormat::Wav => {
                // ZIP handled below in a single pass.
            }
            AudioFormat::Mp3 { bitrate_kbps } => {
                let dst = args.output_path.join(format!("{stem_str}.mp3"));
                let shell = app.shell();
                let cmd = shell
                    .sidecar("ffmpeg")
                    .map_err(err_string)?
                    .args([
                        "-y",
                        "-i", &src.to_string_lossy(),
                        "-codec:a", "libmp3lame",
                        "-b:a", &format!("{}k", bitrate_kbps),
                        &dst.to_string_lossy(),
                    ]);
                let (mut rx, _child) = cmd.spawn().map_err(err_string)?;
                while let Some(ev) = rx.recv().await {
                    if matches!(ev, CommandEvent::Terminated(_)) { break; }
                }
                written.push(dst);
            }
        }
    }

    if args.as_zip && matches!(args.format, AudioFormat::Wav) {
        use std::io::Write;
        let file = fs::File::create(&args.output_path).map_err(err_string)?;
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for stem in &args.selected_stems {
            let stem_str = stem.as_str();
            let src = job_dir.join(format!("{stem_str}.wav"));
            zip.start_file::<_, ()>(format!("{stem_str}.wav"), opts).map_err(err_string)?;
            let bytes = fs::read(&src).map_err(err_string)?;
            zip.write_all(&bytes).map_err(err_string)?;
        }
        zip.finish().map_err(err_string)?;
        written.push(args.output_path.clone());
    }

    Ok(ExportResult { written })
}
