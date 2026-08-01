use crate::models::AppConfig;

/// Port of `_legacy/electron/services/AudioProcessor.ts`.
/// Next task: shell out to system FFmpeg (or sidecar) and emit progress events.
#[derive(Default)]
pub struct AudioProcessor;

impl AudioProcessor {
    pub fn new() -> Self {
        Self
    }

    pub fn convert_file(
        &self,
        _source: &str,
        _output_dir: &str,
        _output_filename: &str,
        _config: &AppConfig,
        _task_id: &str,
    ) -> Result<String, String> {
        Err("AudioProcessor 尚未迁移到 Rust（请后续任务接入 FFmpeg）".into())
    }
}
