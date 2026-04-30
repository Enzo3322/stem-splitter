use tauri::{AppHandle, Emitter};

use crate::types::SidecarEvent;

pub const SIDECAR_EVENT: &str = "sidecar-event";

pub fn emit_sidecar(app: &AppHandle, event: &SidecarEvent) {
    if let Err(err) = app.emit(SIDECAR_EVENT, event) {
        tracing::warn!(?err, "failed to emit sidecar event");
    }
}
