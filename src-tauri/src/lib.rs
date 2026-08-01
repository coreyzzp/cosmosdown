mod commands;
mod models;
mod services;
mod state;

use tauri::Manager;

use commands::{
    batch_conversion, get_files, open_database, select_database, select_folder, set_config,
    start_conversion, try_auto_connect,
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            try_auto_connect(&handle, state.inner());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_database,
            get_files,
            start_conversion,
            batch_conversion,
            set_config,
            select_folder,
            select_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
