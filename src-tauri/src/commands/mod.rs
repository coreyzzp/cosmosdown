use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::models::{AppConfig, AppMessage, CommandResult, PathPickerResult};
use crate::state::AppState;

fn emit_message(app: &AppHandle, message: AppMessage) {
    let _ = app.emit("app-message", message);
}

#[tauri::command]
pub async fn open_database(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<CommandResult, String> {
    {
        let mut db = state.cosmos_db.lock();
        db.connect(&path, None).map_err(|e| e)?;
    }

    {
        let mut config = state.config.lock();
        config.database.path = path.clone();
    }

    emit_message(
        &app,
        AppMessage::DatabaseConnected {
            path: path.clone(),
            auto_connected: Some(false),
            app_info: None,
        },
    );

    let stats = state.cosmos_db.lock().get_statistics().unwrap_or(json!({}));
    Ok(CommandResult::ok_with(
        json!({ "path": path, "stats": stats })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    ))
}

#[tauri::command]
pub async fn get_files(state: State<'_, AppState>) -> Result<CommandResult, String> {
    let files = state
        .cosmos_db
        .lock()
        .get_playlists_with_full_info()
        .map_err(|e| e)?;

    Ok(CommandResult::ok_with(
        json!({ "files": files })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    ))
}

#[tauri::command]
pub async fn start_conversion(
    app: AppHandle,
    state: State<'_, AppState>,
    file_id: Option<String>,
    output_dir: String,
) -> Result<CommandResult, String> {
    let Some(file_id) = file_id else {
        return Ok(CommandResult::err("缺少 fileId"));
    };

    let files = state
        .cosmos_db
        .lock()
        .get_playlists_with_full_info()
        .map_err(|e| e)?;
    let Some(file) = files.into_iter().find(|f| f.id == file_id) else {
        return Ok(CommandResult::err("找不到指定的文件"));
    };

    if !file.is_downloaded || file.local_path.is_none() {
        return Ok(CommandResult::err("文件尚未下载"));
    }

    let local_path = file.local_path.unwrap();
    let safe_title = sanitize_filename(file.title.as_str());
    let output_filename = format!("{safe_title}.mp3");
    let output_path = std::path::Path::new(&output_dir).join(&output_filename);
    let output_path_str = output_path.to_string_lossy().to_string();
    let config = state.config.lock().clone();

    match state.audio_processor.lock().convert_file(
        &local_path,
        &output_dir,
        &output_filename,
        &config,
        &file_id,
    ) {
        Ok(result) => {
            emit_message(
                &app,
                AppMessage::TaskCompleted {
                    task_id: file_id.clone(),
                    result: result.clone(),
                },
            );
            Ok(CommandResult::ok_with(
                json!({ "result": result, "outputPath": output_path_str })
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
            ))
        }
        Err(error) => {
            emit_message(
                &app,
                AppMessage::TaskFailed {
                    task_id: file_id,
                    error: error.clone(),
                },
            );
            Ok(CommandResult::err(error))
        }
    }
}

#[tauri::command]
pub async fn batch_conversion(
    app: AppHandle,
    state: State<'_, AppState>,
    file_ids: Vec<String>,
    output_dir: String,
) -> Result<CommandResult, String> {
    let files = state
        .cosmos_db
        .lock()
        .get_playlists_with_full_info()
        .map_err(|e| e)?;

    let files_to_convert: Vec<_> = files
        .into_iter()
        .filter(|f| file_ids.contains(&f.id) && f.is_downloaded && f.local_path.is_some())
        .collect();

    if files_to_convert.is_empty() {
        return Ok(CommandResult::err("没有可转换的文件"));
    }

    emit_message(
        &app,
        AppMessage::BatchStarted {
            total: files_to_convert.len(),
        },
    );

    let config = state.config.lock().clone();
    let mut converted = 0usize;

    for file in files_to_convert {
        let local_path = file.local_path.clone().unwrap();
        let safe_title = sanitize_filename(&file.title);
        let output_filename = format!("{safe_title}.mp3");

        match state.audio_processor.lock().convert_file(
            &local_path,
            &output_dir,
            &output_filename,
            &config,
            &file.id,
        ) {
            Ok(result) => {
                converted += 1;
                emit_message(
                    &app,
                    AppMessage::TaskCompleted {
                        task_id: file.id,
                        result,
                    },
                );
            }
            Err(error) => {
                emit_message(
                    &app,
                    AppMessage::TaskFailed {
                        task_id: file.id,
                        error,
                    },
                );
            }
        }
    }

    Ok(CommandResult::ok_with(
        json!({ "converted": converted })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    ))
}

#[tauri::command]
pub async fn set_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<CommandResult, String> {
    *state.config.lock() = config.clone();
    Ok(CommandResult::ok_with(
        json!({ "config": config })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    ))
}

#[tauri::command]
pub fn select_folder(app: AppHandle) -> Result<PathPickerResult, String> {
    let path = app
        .dialog()
        .file()
        .set_title("选择输出目录")
        .blocking_pick_folder();

    Ok(match path {
        Some(folder) => PathPickerResult {
            success: true,
            path: Some(folder.to_string()),
        },
        None => PathPickerResult {
            success: false,
            path: None,
        },
    })
}

#[tauri::command]
pub fn select_database(app: AppHandle) -> Result<PathPickerResult, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .add_filter("All Files", &["*"])
        .set_title("选择 SQLite 数据库")
        .blocking_pick_file();

    Ok(match path {
        Some(file) => PathPickerResult {
            success: true,
            path: Some(file.to_string()),
        },
        None => PathPickerResult {
            success: false,
            path: None,
        },
    })
}

pub fn try_auto_connect(app: &AppHandle, state: &AppState) {
    let Some(app_info) = state.xiaoyuzhou.detect() else {
        println!("未检测到小宇宙应用，将使用手动选择模式");
        return;
    };

    let Some(user) = state.xiaoyuzhou.recommended_user(&app_info) else {
        println!("未找到有效用户数据");
        return;
    };

    {
        let mut db = state.cosmos_db.lock();
        if let Err(err) = db.connect(&user.db_path, Some(user.audio_file_path.clone())) {
            println!("自动连接失败: {err}");
            return;
        }
    }

    {
        let mut config = state.config.lock();
        config.database.path = user.db_path.clone();
    }

    emit_message(
        app,
        AppMessage::DatabaseConnected {
            path: user.db_path.clone(),
            auto_connected: Some(true),
            app_info: Some(json!({
                "containerId": app_info.container_id,
                "userId": user.user_id,
                "audioFilePath": user.audio_file_path
            })),
        },
    );

    println!("自动连接成功: {}", user.db_path);
}

fn sanitize_filename(filename: &str) -> String {
    let cleaned: String = filename
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join("_");
    cleaned.chars().take(200).collect()
}
