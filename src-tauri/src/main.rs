// 防止在 release 模式下弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod services;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 初始化应用状态
            app.manage(services::AppState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_database,
            commands::get_files,
            commands::start_conversion,
            commands::batch_conversion,
            commands::select_folder,
            commands::select_database,
            commands::set_config,
            commands::detect_xiaoyuzhou,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
