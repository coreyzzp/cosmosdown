use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::services::audio_processor::{AudioMetadata, AudioProcessor};
use crate::services::cosmos_db::CosmosDbService;
use crate::services::xiaoyuzhou_detector::{XiaoyuzhouAppInfo, XiaoyuzhouDetector};
use crate::services::{AppState, DbStatistics, EpisodeInfo};

/// 批量转换单条结果（serde camelCase，与前端 `BatchConversionResult` 对应）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchConversionResult {
    pub file_id: String,
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

/// 统一向前端推送事件（`app-message` 通道），负载均带 `type` 字段。
/// 前端在 main.ts 中按 discriminated union 分发处理。
fn emit_message(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("app-message", payload);
}

/// 读取数据库路径 / 音频目录 / 配置并立即释放锁。
/// std::sync::Mutex 的 guard 若跨整个命令持有，会在批量转换期间阻塞其他命令。
fn snapshot_state(state: &AppState) -> Result<(Option<String>, Option<String>, crate::services::AppConfig), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let audio_file_path = state.audio_file_path.lock().map_err(|e| e.to_string())?.clone();
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    Ok((db_path, audio_file_path, config))
}

/// 打开数据库，成功后推送 database-connected 事件
#[tauri::command]
pub async fn open_database(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    audio_file_path: Option<String>,
) -> Result<DbStatistics, String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("数据库文件不存在: {path}"));
    }

    {
        let mut db_path = state.db_path.lock().map_err(|e| e.to_string())?;
        *db_path = Some(path.clone());
    }

    if let Some(afp) = audio_file_path {
        let mut audio_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
        *audio_path = Some(afp);
    }

    let stats = CosmosDbService::get_statistics(&path)?;

    emit_message(
        &app,
        json!({
            "type": "database-connected",
            "path": path,
            "autoConnected": false,
        }),
    );

    Ok(stats)
}

/// 获取单集列表
#[tauri::command]
pub async fn get_files(state: State<'_, AppState>) -> Result<Vec<EpisodeInfo>, String> {
    let (db_path, audio_file_path, _) = snapshot_state(&state)?;

    let db_path = db_path.ok_or_else(|| "数据库未连接".to_string())?;
    CosmosDbService::get_playlists_with_full_info(&db_path, audio_file_path.as_deref())
}

/// 转换单个文件为 MP3，期间推送 task-started / task-completed / task-failed 事件
#[tauri::command]
pub async fn start_conversion(
    app: AppHandle,
    state: State<'_, AppState>,
    file_id: String,
    output_dir: String,
) -> Result<String, String> {
    let (db_path, audio_file_path, config) = snapshot_state(&state)?;
    let db_path = db_path.ok_or_else(|| "数据库未连接".to_string())?;

    let files = CosmosDbService::get_playlists_with_full_info(&db_path, audio_file_path.as_deref())?;
    let file = files
        .into_iter()
        .find(|f| f.id == file_id)
        .ok_or_else(|| "找不到指定的文件".to_string())?;

    if !file.is_downloaded {
        return Err("文件尚未下载".to_string());
    }
    let local_path = file.local_path.clone().ok_or("本地文件路径为空".to_string())?;

    let title = file.title.clone().unwrap_or_else(|| file.id.clone());
    let safe_title = AudioProcessor::sanitize_filename(&title);
    let output_filename = format!("{safe_title}.mp3");
    let output_path = std::path::Path::new(&output_dir).join(&output_filename);
    let output_path_str = output_path.to_string_lossy().to_string();

    let metadata = AudioMetadata {
        title: file.title,
        artist: file.podcast_author.clone().or_else(|| file.podcast_title.clone()),
        album: file.podcast_title,
        comment: file.description,
        cover_url: file.image.clone().or_else(|| file.podcast_image.clone()),
    };

    emit_message(
        &app,
        json!({ "type": "task-started", "taskId": file_id, "title": title }),
    );

    match AudioProcessor::convert_to_mp3(&local_path, &output_path_str, &config, Some(&metadata)) {
        Ok(()) => {
            emit_message(
                &app,
                json!({ "type": "task-completed", "taskId": file_id, "outputPath": output_path_str }),
            );
            Ok(output_path_str)
        }
        Err(e) => {
            emit_message(&app, json!({ "type": "task-failed", "taskId": file_id, "error": e }));
            Err(e)
        }
    }
}

/// 批量转换。按调用方传入的 file_ids 顺序逐个转换，
/// 每个文件推送 task-started / task-completed / task-failed，开始时推送 batch-started。
#[tauri::command]
pub async fn batch_conversion(
    app: AppHandle,
    state: State<'_, AppState>,
    file_ids: Vec<String>,
    output_dir: String,
) -> Result<Vec<BatchConversionResult>, String> {
    let (db_path, audio_file_path, config) = snapshot_state(&state)?;
    let db_path = db_path.ok_or_else(|| "数据库未连接".to_string())?;

    let files = CosmosDbService::get_playlists_with_full_info(&db_path, audio_file_path.as_deref())?;

    if files.is_empty() {
        return Err("数据库未连接或没有可转换的文件".to_string());
    }

    let total = file_ids.len();
    if total == 0 {
        return Err("没有可转换的文件".to_string());
    }

    emit_message(&app, json!({ "type": "batch-started", "total": total }));

    let mut results = Vec::with_capacity(total);

    for file_id in &file_ids {
        let Some(file) = files.iter().find(|f| &f.id == file_id) else {
            let error = "找不到指定的文件".to_string();
            emit_message(
                &app,
                json!({ "type": "task-failed", "taskId": file_id, "error": error }),
            );
            results.push(BatchConversionResult {
                file_id: file_id.clone(),
                success: false,
                output_path: None,
                error: Some(error),
            });
            continue;
        };

        if !file.is_downloaded || file.local_path.is_none() {
            let error = "文件尚未下载".to_string();
            emit_message(
                &app,
                json!({ "type": "task-failed", "taskId": file_id, "error": error }),
            );
            results.push(BatchConversionResult {
                file_id: file_id.clone(),
                success: false,
                output_path: None,
                error: Some(error),
            });
            continue;
        }

        let local_path = file.local_path.clone().unwrap();
        let title = file.title.clone().unwrap_or_else(|| file.id.clone());
        let safe_title = AudioProcessor::sanitize_filename(&title);
        let output_filename = format!("{safe_title}.mp3");
        let output_path = std::path::Path::new(&output_dir).join(&output_filename);
        let output_path_str = output_path.to_string_lossy().to_string();

        let metadata = AudioMetadata {
            title: file.title.clone(),
            artist: file.podcast_author.clone().or_else(|| file.podcast_title.clone()),
            album: file.podcast_title.clone(),
            comment: file.description.clone(),
            cover_url: file.image.clone().or_else(|| file.podcast_image.clone()),
        };

        emit_message(
            &app,
            json!({ "type": "task-started", "taskId": file.id, "title": title }),
        );

        match AudioProcessor::convert_to_mp3(&local_path, &output_path_str, &config, Some(&metadata)) {
            Ok(()) => {
                emit_message(
                    &app,
                    json!({ "type": "task-completed", "taskId": file.id, "outputPath": output_path_str }),
                );
                results.push(BatchConversionResult {
                    file_id: file.id.clone(),
                    success: true,
                    output_path: Some(output_path_str),
                    error: None,
                });
            }
            Err(e) => {
                emit_message(&app, json!({ "type": "task-failed", "taskId": file.id, "error": e }));
                results.push(BatchConversionResult {
                    file_id: file.id.clone(),
                    success: false,
                    output_path: None,
                    error: Some(e),
                });
            }
        }
    }

    Ok(results)
}

/// 选择输出目录。
/// 注意：必须是同步命令——blocking_pick_folder 会阻塞当前线程，
/// 放在 async command 里会阻塞 tokio worker，存在死锁风险。
#[tauri::command]
pub fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .set_title("选择输出目录")
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

/// 选择数据库文件（同上，同步命令 + blocking picker）
#[tauri::command]
pub fn select_database(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .add_filter("All Files", &["*"])
        .set_title("选择 SQLite 数据库")
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

/// 设置转换配置（音质 / 最大并发数）
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

/// 检测小宇宙应用并自动连接（写入 db_path / audio_file_path），推送 database-connected 事件
#[tauri::command]
pub async fn detect_xiaoyuzhou(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<XiaoyuzhouAppInfo>, String> {
    let app_info = XiaoyuzhouDetector::detect();

    if let Some(ref info) = app_info {
        if let Some(user) = XiaoyuzhouDetector::get_recommended_user(info) {
            {
                let mut db_path = state.db_path.lock().map_err(|e| e.to_string())?;
                *db_path = Some(user.db_path.clone());
            }
            {
                let mut audio_path = state.audio_file_path.lock().map_err(|e| e.to_string())?;
                *audio_path = Some(user.audio_file_path.clone());
            }

            emit_message(
                &app,
                json!({
                    "type": "database-connected",
                    "path": user.db_path,
                    "autoConnected": true,
                }),
            );
        }
    }

    Ok(app_info)
}
