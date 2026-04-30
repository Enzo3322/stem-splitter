use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StemName {
    Vocals,
    Drums,
    Bass,
    Guitar,
    Piano,
    Other,
}

impl StemName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Vocals => "vocals",
            Self::Drums => "drums",
            Self::Bass => "bass",
            Self::Guitar => "guitar",
            Self::Piano => "piano",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Download,
    Separate,
    Export,
    Prefetch,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Device {
    Cuda,
    Mps,
    Cpu,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub available: Vec<Device>,
    pub selected: Device,
    #[serde(default)]
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stem {
    pub name: StemName,
    pub path: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

/// Mirrors the `event` discriminator from the Python sidecar JSONL stream.
/// See docs/PROTOCOLO_IPC.md.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum SidecarEvent {
    Progress {
        job_id: String,
        ts: u64,
        stage: Stage,
        percent: f32,
        message: String,
    },
    StageComplete {
        job_id: String,
        ts: u64,
        stage: Stage,
        output_path: String,
    },
    StemReady {
        job_id: String,
        ts: u64,
        name: StemName,
        path: String,
        #[serde(default)]
        size_bytes: u64,
    },
    Complete {
        job_id: String,
        ts: u64,
        stems: Vec<Stem>,
        cache_key: String,
        #[serde(default)]
        cache_hit: bool,
        #[serde(default)]
        duration_seconds: f64,
        #[serde(default)]
        title: Option<String>,
    },
    Error {
        job_id: String,
        ts: u64,
        code: String,
        message: String,
        #[serde(default)]
        details: Option<String>,
        #[serde(default)]
        recoverable: bool,
    },
    Log {
        #[serde(default)]
        job_id: String,
        ts: u64,
        level: String,
        message: String,
    },
    DeviceInfo {
        ts: u64,
        available: Vec<Device>,
        selected: Device,
        #[serde(default)]
        details: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AudioFormat {
    Wav,
    Mp3 { bitrate_kbps: u32 },
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryEntry {
    pub cache_key: String,
    pub url: String,
    pub video_id: String,
    pub title: Option<String>,
    pub stored_at: u64,
    pub size_bytes: u64,
    pub stems: Vec<Stem>,
}
