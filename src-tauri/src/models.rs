use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub database: DatabaseConfig,
    pub output_directory: String,
    pub audio_quality: AudioQuality,
    pub max_concurrent_tasks: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            database: DatabaseConfig {
                path: String::new(),
                readonly: true,
            },
            output_directory: String::new(),
            audio_quality: AudioQuality::Medium,
            max_concurrent_tasks: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfig {
    pub path: String,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioQuality {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathPickerResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[allow(dead_code)]
impl CommandResult {
    pub fn ok() -> Self {
        Self {
            success: true,
            error: None,
            extra: serde_json::Map::new(),
        }
    }

    pub fn ok_with(extra: serde_json::Map<String, serde_json::Value>) -> Self {
        Self {
            success: true,
            error: None,
            extra,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(message.into()),
            extra: serde_json::Map::new(),
        }
    }
}

/// Placeholder episode row returned to the UI.
/// Shape will be filled in when CosmosDbService is ported.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub image: Option<String>,
    pub duration: Option<f64>,
    pub pub_date: Option<i64>,
    pub play_count: Option<i64>,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub podcast_title: Option<String>,
    pub podcast_author: Option<String>,
    pub podcast_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppMessage {
    #[serde(rename = "database-connected")]
    DatabaseConnected {
        path: String,
        #[serde(rename = "autoConnected", skip_serializing_if = "Option::is_none")]
        auto_connected: Option<bool>,
        #[serde(rename = "appInfo", skip_serializing_if = "Option::is_none")]
        app_info: Option<serde_json::Value>,
    },
    #[serde(rename = "files-found")]
    FilesFound { files: Vec<PlaylistItem> },
    #[serde(rename = "task-progress")]
    TaskProgress {
        #[serde(rename = "taskId")]
        task_id: String,
        progress: f64,
    },
    #[serde(rename = "task-completed")]
    TaskCompleted {
        #[serde(rename = "taskId")]
        task_id: String,
        result: String,
    },
    #[serde(rename = "task-failed")]
    TaskFailed {
        #[serde(rename = "taskId")]
        task_id: String,
        error: String,
    },
    #[serde(rename = "batch-started")]
    BatchStarted { total: usize },
}
