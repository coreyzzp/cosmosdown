use crate::models::PlaylistItem;

/// Port of `_legacy/electron/services/CosmosDbService.ts`.
/// Next task: implement SQLite access with `rusqlite`.
#[derive(Default)]
pub struct CosmosDbService {
    db_path: Option<String>,
    audio_file_path: Option<String>,
    connected: bool,
}

#[allow(dead_code)]
impl CosmosDbService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn connect(
        &mut self,
        db_path: impl Into<String>,
        audio_file_path: Option<String>,
    ) -> Result<(), String> {
        let db_path = db_path.into();
        if !std::path::Path::new(&db_path).exists() {
            return Err(format!("数据库文件不存在: {db_path}"));
        }

        self.db_path = Some(db_path);
        self.audio_file_path = audio_file_path;
        self.connected = true;
        // TODO(task): open SQLite and validate Cosmos schema
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    pub fn db_path(&self) -> Option<&str> {
        self.db_path.as_deref()
    }

    pub fn get_statistics(&self) -> Result<serde_json::Value, String> {
        if !self.connected {
            return Err("数据库未连接".into());
        }
        // TODO(task): return real table counts
        Ok(serde_json::json!({
            "status": "connected",
            "implemented": false,
            "note": "CosmosDbService pending Rust port"
        }))
    }

    pub fn get_playlists_with_full_info(&self) -> Result<Vec<PlaylistItem>, String> {
        if !self.connected {
            return Err("数据库未连接".into());
        }
        // TODO(task): query Playlist + AudioFileTable_v2 + local file mapping
        Ok(Vec::new())
    }
}
