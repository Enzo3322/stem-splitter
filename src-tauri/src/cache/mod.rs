use std::path::PathBuf;

use anyhow::{Context, Result};
use tauri::Manager;

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
