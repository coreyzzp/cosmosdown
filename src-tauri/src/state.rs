use parking_lot::Mutex;

use crate::models::AppConfig;
use crate::services::audio_processor::AudioProcessor;
use crate::services::cosmos_db::CosmosDbService;
use crate::services::xiaoyuzhou::XiaoyuzhouDetector;

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub cosmos_db: Mutex<CosmosDbService>,
    pub audio_processor: Mutex<AudioProcessor>,
    pub xiaoyuzhou: XiaoyuzhouDetector,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(AppConfig::default()),
            cosmos_db: Mutex::new(CosmosDbService::new()),
            audio_processor: Mutex::new(AudioProcessor::new()),
            xiaoyuzhou: XiaoyuzhouDetector::new(),
        }
    }
}
