use std::sync::Arc;

use anyhow::{Context, Result};
use dashmap::DashMap;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::events::{emit_prefetch, emit_sidecar};
use crate::types::SidecarEvent;

pub type JobId = String;

const SIDECAR_NAME: &str = "stem-splitter-sidecar";

pub struct SidecarHandle {
    #[allow(dead_code)] // kept for diagnostics / future per-job introspection
    pub job_id: JobId,
    child: parking_lot::Mutex<Option<CommandChild>>,
}

impl SidecarHandle {
    pub fn kill(&self) -> Result<()> {
        if let Some(child) = self.child.lock().take() {
            child.kill().context("kill sidecar")?;
        }
        Ok(())
    }
}

type JobsMap = DashMap<JobId, Arc<SidecarHandle>>;

pub struct SidecarManager {
    jobs: Arc<JobsMap>,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self { jobs: Arc::new(JobsMap::new()) }
    }
}

impl SidecarManager {
    pub fn new() -> Self { Self::default() }

    /// Spawns the sidecar with `args`, streams stdout JSONL, parses each line into
    /// [`SidecarEvent`] and re-emits via `app_handle.emit("sidecar-event", _)`.
    /// Returns the job id immediately; the read/parse loop runs in a tokio task.
    pub fn spawn(&self, app: AppHandle, args: Vec<String>) -> Result<JobId> {
        let job_id = Uuid::new_v4().to_string();
        // Global flags MUST precede the subcommand for argparse. Prepend.
        let mut prefixed = vec!["--job-id".into(), job_id.clone()];
        prefixed.extend(args);
        let args = prefixed;

        let shell = app.shell();
        let cmd = shell
            .sidecar(SIDECAR_NAME)
            .context("locating sidecar binary (run scripts/build-sidecar.sh)")?
            .args(&args);

        let (mut rx, child) = cmd.spawn().context("spawn sidecar process")?;

        let handle = Arc::new(SidecarHandle {
            job_id: job_id.clone(),
            child: parking_lot::Mutex::new(Some(child)),
        });
        self.jobs.insert(job_id.clone(), handle);

        let (line_tx, mut line_rx) = mpsc::unbounded_channel::<String>();

        // Reader: collects stdout lines, forwards stderr to tracing, signals termination.
        let app_for_reader = app.clone();
        let job_for_reader = job_id.clone();
        let jobs_for_reader = Arc::clone(&self.jobs);
        tokio::spawn(async move {
            let mut stdout_buf = String::new();
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        if let Ok(s) = std::str::from_utf8(&bytes) {
                            stdout_buf.push_str(s);
                            while let Some(idx) = stdout_buf.find('\n') {
                                let line = stdout_buf[..idx].trim().to_string();
                                stdout_buf.drain(..=idx);
                                if !line.is_empty() {
                                    let _ = line_tx.send(line);
                                }
                            }
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        if let Ok(s) = std::str::from_utf8(&bytes) {
                            tracing::debug!(target: "sidecar", "stderr: {}", s.trim());
                        }
                    }
                    CommandEvent::Error(err) => {
                        tracing::error!(?err, "sidecar runtime error");
                        let synthetic = SidecarEvent::Error {
                            job_id: job_for_reader.clone(),
                            ts: now_ms(),
                            code: "INTERNAL".into(),
                            message: err.to_string(),
                            details: None,
                            recoverable: false,
                        };
                        emit_sidecar(&app_for_reader, &synthetic);
                    }
                    CommandEvent::Terminated(payload) => {
                        tracing::info!(?payload, "sidecar terminated");
                        break;
                    }
                    _ => {}
                }
            }
            let tail = stdout_buf.trim();
            if !tail.is_empty() {
                let _ = line_tx.send(tail.to_string());
            }
            jobs_for_reader.remove(&job_for_reader);
        });

        // Parser: typed deserialization + emit to frontend.
        let app_for_parser = app.clone();
        tokio::spawn(async move {
            while let Some(line) = line_rx.recv().await {
                match serde_json::from_str::<SidecarEvent>(&line) {
                    Ok(ev) => emit_sidecar(&app_for_parser, &ev),
                    Err(err) => tracing::warn!(?err, raw = %line, "unparsable sidecar event"),
                }
            }
        });

        Ok(job_id)
    }

    pub fn cancel(&self, job_id: &str) -> Result<()> {
        if let Some((_, handle)) = self.jobs.remove(job_id) {
            handle.kill()?;
        }
        Ok(())
    }

    /// Streams sidecar events to the `prefetch-event` channel until the process
    /// exits. Returns Err if the sidecar emits an `error` event or terminates
    /// non-zero. Used for the model pre-download on app startup.
    pub async fn run_prefetch(app: AppHandle, args: Vec<String>) -> Result<()> {
        let shell = app.shell();
        let cmd = shell
            .sidecar(SIDECAR_NAME)
            .context("locating sidecar binary")?
            .args(&args);

        let (mut rx, _child) = cmd.spawn().context("spawn sidecar")?;
        let mut buf = String::new();
        let mut last_error: Option<String> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    if let Ok(s) = std::str::from_utf8(&bytes) {
                        buf.push_str(s);
                        while let Some(idx) = buf.find('\n') {
                            let line = buf[..idx].trim().to_string();
                            buf.drain(..=idx);
                            if line.is_empty() { continue; }
                            match serde_json::from_str::<SidecarEvent>(&line) {
                                Ok(ev) => {
                                    if let SidecarEvent::Error { message, .. } = &ev {
                                        last_error = Some(message.clone());
                                    }
                                    emit_prefetch(&app, &ev);
                                }
                                Err(err) => tracing::warn!(?err, raw = %line, "unparsable prefetch event"),
                            }
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    if let Ok(s) = std::str::from_utf8(&bytes) {
                        tracing::debug!(target: "sidecar.prefetch", "stderr: {}", s.trim());
                    }
                }
                CommandEvent::Terminated(payload) => {
                    tracing::info!(?payload, "prefetch sidecar terminated");
                    if let Some(code) = payload.code {
                        if code != 0 && last_error.is_none() {
                            last_error = Some(format!("sidecar exited with code {code}"));
                        }
                    }
                    break;
                }
                _ => {}
            }
        }
        let tail = buf.trim();
        if !tail.is_empty() {
            if let Ok(ev) = serde_json::from_str::<SidecarEvent>(tail) {
                emit_prefetch(&app, &ev);
            }
        }
        if let Some(msg) = last_error {
            anyhow::bail!(msg);
        }
        Ok(())
    }

    /// One-shot helper: spawns sidecar, drains events until termination, returns them.
    /// Used for short queries like `device-info`.
    pub async fn run_oneshot(app: AppHandle, args: Vec<String>) -> Result<Vec<SidecarEvent>> {
        let shell = app.shell();
        let cmd = shell
            .sidecar(SIDECAR_NAME)
            .context("locating sidecar binary")?
            .args(&args);

        let (mut rx, _child) = cmd.spawn().context("spawn sidecar")?;
        let mut events = Vec::new();
        let mut buf = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    buf.push_str(std::str::from_utf8(&bytes).unwrap_or(""));
                    while let Some(idx) = buf.find('\n') {
                        let line = buf[..idx].trim().to_string();
                        buf.drain(..=idx);
                        if line.is_empty() { continue; }
                        if let Ok(ev) = serde_json::from_str::<SidecarEvent>(&line) {
                            events.push(ev);
                        }
                    }
                }
                CommandEvent::Terminated(_) => break,
                _ => {}
            }
        }
        let tail = buf.trim();
        if !tail.is_empty() {
            if let Ok(ev) = serde_json::from_str::<SidecarEvent>(tail) {
                events.push(ev);
            }
        }
        Ok(events)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}
