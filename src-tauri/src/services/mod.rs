use std::sync::Mutex;

pub mod cosmos_db;
pub mod audio_processor;
pub mod xiaoyuzhou_detector;

/// 应用全局状态
pub struct AppState {
    pub db_path: Mutex<Option<String>>,
    pub audio_file_path: Mutex<Option<String>>,
    pub config: Mutex<AppConfig>,
}

/// 应用配置
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub audio_quality: String,
    pub max_concurrent_tasks: u32,
    pub output_directory: String,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db_path: Mutex::new(None),
            audio_file_path: Mutex::new(None),
            config: Mutex::new(AppConfig {
                audio_quality: "medium".to_string(),
                max_concurrent_tasks: 3,
                output_directory: String::new(),
            }),
        }
    }
}

/// 播客单集完整信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeInfo {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub duration: Option<f64>,
    pub pub_date: Option<i64>,
    pub play_count: i64,
    pub comment_count: i64,
    pub is_favorited: bool,
    pub is_finished: bool,

    // 播客频道信息
    pub podcast_id: Option<String>,
    pub podcast_title: Option<String>,
    pub podcast_author: Option<String>,
    pub podcast_description: Option<String>,
    pub podcast_image: Option<String>,
    pub subscription_count: i64,

    // 音频文件信息
    pub audio_eid: Option<String>,
    pub audio_filename: Option<String>,
    pub audio_url: Option<String>,
    pub audio_size: i64,
    pub audio_key: Option<String>,

    // 本地文件信息
    pub local_path: Option<String>,
    pub is_downloaded: bool,
    pub local_file_size: u64,
    pub local_file_format: String,

    // 播放进度
    pub progress: f64,
    pub progress_percent: i64,
    pub last_played: Option<i64>,
}

/// 数据库统计信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatistics {
    pub audio_file_count: i64,
    pub playlist_count: i64,
    pub podcast_count: i64,
    pub total_duration: f64,
}
