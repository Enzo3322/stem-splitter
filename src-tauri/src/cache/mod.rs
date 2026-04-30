use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;
use tauri::Manager;

use crate::types::{LibraryEntry, Stem, StemName};

const METADATA_FILE: &str = "metadata.json";

pub fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_cache_dir()
        .context("app cache dir")?
        .join("stems");
    std::fs::create_dir_all(&dir).context("mkdir cache dir")?;
    Ok(dir)
}

pub fn dir_size_bytes(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    let Ok(read) = std::fs::read_dir(path) else { return 0; };
    for entry in read.flatten() {
        let Ok(meta) = entry.metadata() else { continue; };
        if meta.is_dir() {
            total = total.saturating_add(dir_size_bytes(&entry.path()));
        } else {
            total = total.saturating_add(meta.len());
        }
    }
    total
}

pub fn clear(path: &std::path::Path) -> Result<()> {
    if !path.exists() { return Ok(()); }
    std::fs::remove_dir_all(path).context("remove cache dir")?;
    std::fs::create_dir_all(path).context("recreate cache dir")?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct MetadataFile {
    url: String,
    video_id: String,
    stems: HashMap<String, String>,
    #[serde(default)]
    stored_at: u64,
    #[serde(default)]
    title: Option<String>,
}

fn parse_stem_name(name: &str) -> Option<StemName> {
    match name {
        "vocals" => Some(StemName::Vocals),
        "drums" => Some(StemName::Drums),
        "bass" => Some(StemName::Bass),
        "guitar" => Some(StemName::Guitar),
        "piano" => Some(StemName::Piano),
        "other" => Some(StemName::Other),
        _ => None,
    }
}

fn read_entry(entry_dir: &Path) -> Option<LibraryEntry> {
    let cache_key = entry_dir.file_name()?.to_string_lossy().into_owned();
    let meta_path = entry_dir.join(METADATA_FILE);
    let raw = std::fs::read_to_string(&meta_path).ok()?;
    let meta: MetadataFile = serde_json::from_str(&raw).ok()?;

    let mut stems: Vec<Stem> = Vec::with_capacity(meta.stems.len());
    let mut size_bytes: u64 = 0;
    for (name, rel) in &meta.stems {
        let Some(stem_name) = parse_stem_name(name) else { return None };
        let abs = entry_dir.join(rel);
        let file_meta = std::fs::metadata(&abs).ok()?;
        if !file_meta.is_file() {
            return None;
        }
        size_bytes = size_bytes.saturating_add(file_meta.len());
        stems.push(Stem {
            name: stem_name,
            path: abs.to_string_lossy().into_owned(),
            size_bytes: Some(file_meta.len()),
        });
    }

    Some(LibraryEntry {
        cache_key,
        url: meta.url,
        video_id: meta.video_id,
        title: meta.title,
        stored_at: meta.stored_at,
        size_bytes,
        stems,
    })
}

pub fn list_entries(cache_dir: &Path) -> Vec<LibraryEntry> {
    let Ok(read) = std::fs::read_dir(cache_dir) else { return Vec::new(); };
    let mut entries: Vec<LibraryEntry> = read
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let path = e.path();
            match read_entry(&path) {
                Some(entry) => Some(entry),
                None => {
                    tracing::debug!(?path, "skipping unreadable cache entry");
                    None
                }
            }
        })
        .collect();
    entries.sort_by(|a, b| b.stored_at.cmp(&a.stored_at));
    entries
}

pub fn touch_entry(cache_dir: &Path, cache_key: &str) -> Result<()> {
    let target = cache_dir.join(cache_key);
    if !target.is_dir() {
        anyhow::bail!("cache entry not found: {cache_key}");
    }
    // Update the directory's mtime by creating and removing a sentinel file.
    // Python's cache.lookup() does Path.touch() on the dir for LRU recency;
    // this matches that semantic without an extra crate.
    let sentinel = target.join(".touch");
    std::fs::File::create(&sentinel).context("create touch sentinel")?;
    std::fs::remove_file(&sentinel).context("remove touch sentinel")?;
    Ok(())
}
