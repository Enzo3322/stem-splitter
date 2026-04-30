use tauri::{AppHandle, Emitter};

use crate::types::SidecarEvent;

pub const SIDECAR_EVENT: &str = "sidecar-event";
pub const PREFETCH_EVENT: &str = "prefetch-event";

pub fn emit_sidecar(app: &AppHandle, event: &SidecarEvent) {
    if let Err(err) = app.emit(SIDECAR_EVENT, event) {
        tracing::warn!(?err, "failed to emit sidecar event");
    }
}

pub fn emit_prefetch(app: &AppHandle, event: &SidecarEvent) {
    if let Err(err) = app.emit(PREFETCH_EVENT, event) {
        tracing::warn!(?err, "failed to emit prefetch event");
    }
}
