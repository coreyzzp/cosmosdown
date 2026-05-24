use std::fs;
use std::path::{Path, PathBuf};

/// 小宇宙应用检测器
/// 自动检测 macOS 上小宇宙应用的安装位置和用户数据
pub struct XiaoyuzhouDetector;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XiaoyuzhouUserInfo {
    pub user_id: String,
    pub db_path: String,
    pub audio_file_path: String,
    pub user_storage_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XiaoyuzhouAppInfo {
    pub container_id: String,
    pub container_path: String,
    pub documents_path: String,
    pub users: Vec<XiaoyuzhouUserInfo>,
}

impl XiaoyuzhouDetector {
    const KNOWN_CONTAINER_IDS: &'static [&'static str] = &[
        "8A51F41B-4985-4AD1-B6C2-384D6EC1A651",
    ];

    /// 获取容器基础路径
    fn container_base_path() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        home.join("Library").join("Containers")
    }

    /// 自动检测小宇宙应用
    pub fn detect() -> Option<XiaoyuzhouAppInfo> {
        // 1. 尝试已知的容器 ID
        for container_id in Self::KNOWN_CONTAINER_IDS {
            if let Some(app_info) = Self::check_container(container_id) {
                println!("✅ 找到小宇宙应用 (已知容器): {}", container_id);
                return Some(app_info);
            }
        }

        // 2. 搜索所有容器
        println!("🔍 在所有容器中搜索小宇宙应用...");
        Self::search_all_containers()
    }

    /// 检查指定容器 ID
    fn check_container(container_id: &str) -> Option<XiaoyuzhouAppInfo> {
        let container_path = Self::container_base_path().join(container_id);

        if !container_path.exists() {
            return None;
        }

        let documents_path = container_path.join("Data").join("Documents");
        if !documents_path.exists() {
            return None;
        }

        // 检查是否存在 UserStorages 目录
        let user_storages_path = documents_path.join("UserStorages");
        if !user_storages_path.exists() {
            return None;
        }

        let users = Self::get_users_from_documents(&documents_path);
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

    /// 搜索所有容器
    fn search_all_containers() -> Option<XiaoyuzhouAppInfo> {
        let base_path = Self::container_base_path();
        if !base_path.exists() {
            return None;
        }

        let entries = fs::read_dir(&base_path).ok()?;

        for entry in entries.flatten() {
            let container_id = entry.file_name().to_string_lossy().to_string();

            // 跳过已知的容器 ID
            if Self::KNOWN_CONTAINER_IDS.contains(&container_id.as_str()) {
                continue;
            }

            if let Some(app_info) = Self::check_container(&container_id) {
                println!("✅ 找到小宇宙应用 (搜索发现): {}", container_id);
                return Some(app_info);
            }
        }

        None
    }

    /// 从 Documents 目录获取用户列表
    fn get_users_from_documents(documents_path: &Path) -> Vec<XiaoyuzhouUserInfo> {
        let mut users = Vec::new();

        // 方法1: 从 UserStorages 目录读取
        let user_storages_path = documents_path.join("UserStorages");
        if user_storages_path.exists() {
            if let Ok(entries) = fs::read_dir(&user_storages_path) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let user_id = entry.file_name().to_string_lossy().to_string();
                        if let Some(user_info) =
                            Self::get_user_info(documents_path, &user_id)
                        {
                            users.push(user_info);
                        }
                    }
                }
            }
        }

        // 方法2: 从 Documents 根目录读取
        if users.is_empty() {
            if let Ok(entries) = fs::read_dir(documents_path) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let user_id = entry.file_name().to_string_lossy().to_string();
                        let db_path = entry.path().join("db").join("cosmos.db");
                        if db_path.exists() {
                            if let Some(user_info) =
                                Self::get_user_info(documents_path, &user_id)
                            {
                                users.push(user_info);
                            }
                        }
                    }
                }
            }
        }

        users
    }

    /// 获取用户信息
    fn get_user_info(documents_path: &Path, user_id: &str) -> Option<XiaoyuzhouUserInfo> {
        let possible_paths = [
            documents_path.join(user_id),
            documents_path.join("UserStorages").join(user_id),
        ];

        for user_storage_path in &possible_paths {
            if !user_storage_path.exists() {
                continue;
            }

            let db_path = user_storage_path.join("db").join("cosmos.db");
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

    /// 获取推荐用户
    pub fn get_recommended_user(app_info: &XiaoyuzhouAppInfo) -> Option<&XiaoyuzhouUserInfo> {
        app_info.users.first()
    }
}
