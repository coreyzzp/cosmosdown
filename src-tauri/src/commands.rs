use tauri::State;

use crate::services::{AppState, EpisodeInfo, DbStatistics};
use crate::services::cosmos_db::CosmosDbService;
use crate::services::audio_processor::{AudioProcessor, AudioMetadata};
use crate::services::xiaoyuzhou_detector::{XiaoyuzhouDetector, XiaoyuzhouAppInfo};

/// 打开数据库
#[tauri::command]
pub async fn open_database(
    state: State<'_, AppState>,
    path: String,
    audio_file_path: Option<String>,
) -> Result<DbStatistics, String> {
    // 检查文件是否存在
    if !std::path::Path::new(&path).exists() {
        return Err(format!("数据库文件不存在: {}", path));
    }

    // 保存路径到状态
    {
        let mut db_path = state.db_path.lock().map_err(|e| e.to_string())?;
        *db_path = Some(path.clone());
    }

    if let Some(ref afp) = audio_file_path {
        let mut audio_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
        *audio_path = Some(afp.clone());
    }

    // 获取统计信息
    let stats = CosmosDbService::get_statistics(&path)?;
    println!("📊 数据库统计: {:?}", stats);

    Ok(stats)
}

/// 获取文件列表
#[tauri::command]
pub async fn get_files(state: State<'_, AppState>) -> Result<Vec<EpisodeInfo>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let audio_file_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;

    let db_path = db_path
        .as_ref()
        .ok_or_else(|| "数据库未连接".to_string())?;

    CosmosDbService::get_playlists_with_full_info(db_path, audio_file_path.as_deref())
}

/// 开始单个文件转换
#[tauri::command]
pub async fn start_conversion(
    state: State<'_, AppState>,
    file_id: String,
    output_dir: String,
) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let audio_file_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();

    let db_path = db_path
        .as_ref()
        .ok_or_else(|| "数据库未连接".to_string())?;

    // 获取文件信息
    let files = CosmosDbService::get_playlists_with_full_info(db_path, audio_file_path.as_deref())?;
    let file = files
        .iter()
        .find(|f| f.id == file_id)
        .ok_or_else(|| "找不到指定的文件".to_string())?;

    if !file.is_downloaded {
        return Err("文件尚未下载".to_string());
    }

    let local_path = file
        .local_path
        .as_ref()
        .ok_or_else(|| "本地文件路径为空".to_string())?;

    // 生成输出文件名
    let safe_title = AudioProcessor::sanitize_filename(
        file.title.as_deref().unwrap_or(&file.id),
    );
    let output_filename = format!("{}.mp3", safe_title);
    let output_path = std::path::Path::new(&output_dir).join(&output_filename);
    let output_path_str = output_path.to_string_lossy().to_string();

    // 准备元数据
    let metadata = AudioMetadata {
        title: file.title.clone(),
        artist: file.podcast_author.clone().or_else(|| file.podcast_title.clone()),
        album: file.podcast_title.clone(),
        comment: file.description.clone(),
        cover_url: file.image.clone().or_else(|| file.podcast_image.clone()),
    };

    // 执行转换
    AudioProcessor::convert_to_mp3(local_path, &output_path_str, &config, Some(&metadata))?;

    Ok(output_path_str)
}

/// 批量转换
#[tauri::command]
pub async fn batch_conversion(
    state: State<'_, AppState>,
    file_ids: Vec<String>,
    output_dir: String,
) -> Result<Vec<BatchConversionResult>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let audio_file_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();

    let db_path = db_path
        .as_ref()
        .ok_or_else(|| "数据库未连接".to_string())?;

    let files = CosmosDbService::get_playlists_with_full_info(db_path, audio_file_path.as_deref())?;

    let mut results = Vec::new();

    for file_id in &file_ids {
        let file = match files.iter().find(|f| &f.id == file_id) {
            Some(f) => f,
            None => {
                results.push(BatchConversionResult {
                    file_id: file_id.clone(),
                    success: false,
                    output_path: None,
                    error: Some("找不到指定的文件".to_string()),
                });
                continue;
            }
        };

        if !file.is_downloaded {
            results.push(BatchConversionResult {
                file_id: file_id.clone(),
                success: false,
                output_path: None,
                error: Some("文件尚未下载".to_string()),
            });
            continue;
        }

        let local_path = match &file.local_path {
            Some(p) => p.clone(),
            None => {
                results.push(BatchConversionResult {
                    file_id: file_id.clone(),
                    success: false,
                    output_path: None,
                    error: Some("本地文件路径为空".to_string()),
                });
                continue;
            }
        };

        let safe_title = AudioProcessor::sanitize_filename(
            file.title.as_deref().unwrap_or(&file.id),
        );
        let output_filename = format!("{}.mp3", safe_title);
        let output_path = std::path::Path::new(&output_dir).join(&output_filename);
        let output_path_str = output_path.to_string_lossy().to_string();

        let metadata = AudioMetadata {
            title: file.title.clone(),
            artist: file.podcast_author.clone().or_else(|| file.podcast_title.clone()),
            album: file.podcast_title.clone(),
            comment: file.description.clone(),
            cover_url: file.image.clone().or_else(|| file.podcast_image.clone()),
        };

        match AudioProcessor::convert_to_mp3(&local_path, &output_path_str, &config, Some(&metadata)) {
            Ok(()) => {
                results.push(BatchConversionResult {
                    file_id: file_id.clone(),
                    success: true,
                    output_path: Some(output_path_str),
                    error: None,
                });
            }
            Err(e) => {
                results.push(BatchConversionResult {
                    file_id: file_id.clone(),
                    success: false,
                    output_path: None,
                    error: Some(e),
                });
            }
        }
    }

    Ok(results)
}

/// 选择文件夹
#[tauri::command]
pub async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let path = app.dialog().file().blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

/// 选择数据库文件
#[tauri::command]
pub async fn select_database(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let path = app
        .dialog()
        .file()
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    
    Ok(path.map(|p| p.to_string()))
}

/// 设置配置
#[tauri::command]
pub async fn set_config(
    state: State<'_, AppState>,
    audio_quality: String,
    max_concurrent_tasks: u32,
) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.audio_quality = audio_quality;
    config.max_concurrent_tasks = max_concurrent_tasks;
    Ok(())
}

/// 检测小宇宙应用
#[tauri::command]
pub async fn detect_xiaoyuzhou(
    state: State<'_, AppState>,
) -> Result<Option<XiaoyuzhouAppInfo>, String> {
    let app_info = XiaoyuzhouDetector::detect();

    if let Some(ref info) = app_info {
        if let Some(user) = XiaoyuzhouDetector::get_recommended_user(info) {
            // 自动连接数据库
            let mut db_path = state.db_path.lock().map_err(|e| e.to_string())?;
            *db_path = Some(user.db_path.clone());

            let mut audio_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
            *audio_path = Some(user.audio_file_path.clone());

            println!("✅ 自动连接小宇宙数据库: {}", user.db_path);
        }
    }

    Ok(app_info)
}

/// 批量转换结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchConversionResult {
    pub file_id: String,
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
}
