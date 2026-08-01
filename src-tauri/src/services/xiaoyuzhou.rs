use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XiaoyuzhouUserInfo {
    pub user_id: String,
    pub db_path: String,
    pub audio_file_path: String,
    pub user_storage_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XiaoyuzhouAppInfo {
    pub container_id: String,
    pub container_path: String,
    pub documents_path: String,
    pub users: Vec<XiaoyuzhouUserInfo>,
}

/// Port of `_legacy/electron/services/XiaoyuzhouDetector.ts`.
#[derive(Default)]
pub struct XiaoyuzhouDetector {
    known_container_ids: Vec<&'static str>,
}

impl XiaoyuzhouDetector {
    pub fn new() -> Self {
        Self {
            known_container_ids: vec!["8A51F41B-4985-4AD1-B6C2-384D6EC1A651"],
        }
    }

    pub fn detect(&self) -> Option<XiaoyuzhouAppInfo> {
        #[cfg(target_os = "macos")]
        {
            let home = dirs_home()?;
            let containers = home.join("Library/Containers");

            for container_id in &self.known_container_ids {
                if let Some(info) = self.check_container(&containers, container_id) {
                    return Some(info);
                }
            }

            if let Ok(entries) = std::fs::read_dir(&containers) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let Some(container_id) = name.to_str() else {
                        continue;
                    };
                    if self.known_container_ids.contains(&container_id) {
                        continue;
                    }
                    if let Some(info) = self.check_container(&containers, container_id) {
                        return Some(info);
                    }
                }
            }
            None
        }

        #[cfg(not(target_os = "macos"))]
        {
            None
        }
    }

    pub fn recommended_user<'a>(&self, app: &'a XiaoyuzhouAppInfo) -> Option<&'a XiaoyuzhouUserInfo> {
        app.users.first()
    }

    #[cfg(target_os = "macos")]
    fn check_container(&self, containers: &Path, container_id: &str) -> Option<XiaoyuzhouAppInfo> {
        let container_path = containers.join(container_id);
        let documents_path = container_path.join("Data/Documents");
        if !documents_path.is_dir() {
            return None;
        }

        let users = self.get_users_from_documents(&documents_path);
        if users.is_empty() {
            return None;
        }

        Some(XiaoyuzhouAppInfo {
            container_id: container_id.to_string(),
            container_path: container_path.to_string_lossy().to_string(),
            documents_path: documents_path.to_string_lossy().to_string(),
            users,
        })
    }

    #[cfg(target_os = "macos")]
    fn get_users_from_documents(&self, documents_path: &Path) -> Vec<XiaoyuzhouUserInfo> {
        let mut users = Vec::new();
        let user_storages = documents_path.join("UserStorages");

        if user_storages.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&user_storages) {
                for entry in entries.flatten() {
                    if !entry.path().is_dir() {
                        continue;
                    }
                    let user_id = entry.file_name().to_string_lossy().to_string();
                    if let Some(user) = self.get_user_info(documents_path, &user_id) {
                        users.push(user);
                    }
                }
            }
        }

        if users.is_empty() {
            if let Ok(entries) = std::fs::read_dir(documents_path) {
                for entry in entries.flatten() {
                    if !entry.path().is_dir() {
                        continue;
                    }
                    let user_id = entry.file_name().to_string_lossy().to_string();
                    let db_path = entry.path().join("db/cosmos.db");
                    if db_path.exists() {
                        if let Some(user) = self.get_user_info(documents_path, &user_id) {
                            users.push(user);
                        }
                    }
                }
            }
        }

        users
    }

    #[cfg(target_os = "macos")]
    fn get_user_info(&self, documents_path: &Path, user_id: &str) -> Option<XiaoyuzhouUserInfo> {
        let possible_paths = [
            documents_path.join(user_id),
            documents_path.join("UserStorages").join(user_id),
        ];

        for user_storage_path in possible_paths {
            if !user_storage_path.is_dir() {
                continue;
            }
            let db_path = user_storage_path.join("db/cosmos.db");
            if !db_path.exists() {
                continue;
            }

            let audio_file_path = documents_path.join("AudioFile").join(user_id);
            return Some(XiaoyuzhouUserInfo {
                user_id: user_id.to_string(),
                db_path: db_path.to_string_lossy().to_string(),
                audio_file_path: audio_file_path.to_string_lossy().to_string(),
                user_storage_path: user_storage_path.to_string_lossy().to_string(),
            });
        }

        None
    }
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
