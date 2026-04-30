mod cache;
mod commands;
mod events;
mod sidecar;
mod types;

use std::sync::Arc;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,stem_splitter_lib=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .manage(Arc::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::process_url,
            commands::cancel_job,
            commands::get_device_info,
            commands::clear_cache,
            commands::get_cache_size,
            commands::export_stems,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
