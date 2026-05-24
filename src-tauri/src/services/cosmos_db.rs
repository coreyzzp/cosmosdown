use rusqlite::{Connection, OpenFlags};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::EpisodeInfo;

/// Cosmos 数据库服务
/// 用于读取和处理小宇宙的 SQLite 数据库
pub struct CosmosDbService;

impl CosmosDbService {
    /// 获取完整的播客单集信息
    pub fn get_playlists_with_full_info(
        db_path: &str,
        audio_file_path: Option<&str>,
    ) -> Result<Vec<EpisodeInfo>, String> {
        let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("数据库连接失败: {}", e))?;

        let query = r#"
            SELECT 
                p.id,
                p.pid,
                p.title,
                p.description,
                p.image,
                p.duration,
                p.pubDate,
                p.playCount,
                p.commentCount,
                p.isFavorited,
                p.isFinished,
                p.media,
                
                pp.id as podcast_id,
                pp.title as podcast_title,
                pp.author as podcast_author,
                pp.description as podcast_description,
                pp.image as podcast_image,
                pp.subscriptionCount,
                
                a.eid as audio_eid,
                a.name as audio_filename,
                a.url as audio_url,
                a.size as audio_size,
                a.audioKey as audio_key,
                
                pg.idProgress as progress,
                pg.playedAt as last_played
                
            FROM Playlist p
            LEFT JOIN PlaylistPodcast pp ON p.pid = pp.id
            LEFT JOIN AudioFileTable_v2 a ON json_extract(p.media, '$.enclosure.url') = a.url
            LEFT JOIN PlaylistProgress pg ON p.id = pg.id
            
            ORDER BY p.pubDate DESC
        "#;

        // 构建文件名缓存
        let file_cache = if let Some(audio_dir) = audio_file_path {
            Self::build_file_name_cache(audio_dir)
        } else {
            // 从数据库路径推测音频目录
            let db_dir = Path::new(db_path);
            if let Some(user_dir) = db_dir.parent().and_then(|p| p.parent()) {
                if let Some(documents_dir) = user_dir.parent() {
                    if let Some(user_id) = user_dir.file_name() {
                        let audio_dir = documents_dir
                            .join("AudioFile")
                            .join(user_id);
                        Self::build_file_name_cache(audio_dir.to_str().unwrap_or(""))
                    } else {
                        HashMap::new()
                    }
                } else {
                    HashMap::new()
                }
            } else {
                HashMap::new()
            }
        };

        let audio_dir_path = audio_file_path.map(PathBuf::from).or_else(|| {
            let db_dir = Path::new(db_path);
            db_dir.parent().and_then(|p| p.parent()).and_then(|user_dir| {
                user_dir.parent().map(|documents_dir| {
                    let user_id = user_dir.file_name().unwrap_or_default();
                    documents_dir.join("AudioFile").join(user_id)
                })
            })
        });

        let mut stmt = conn.prepare(query).map_err(|e| format!("SQL 准备失败: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let duration: Option<f64> = row.get(5)?;
                let progress: Option<f64> = row.get(23)?;
                let audio_filename: Option<String> = row.get(19)?;

                // 查找本地文件
                let (local_path, is_downloaded, local_file_size, local_file_format) =
                    Self::find_local_file(&id, audio_filename.as_deref(), &file_cache, audio_dir_path.as_deref());

                let progress_val = progress.unwrap_or(0.0);
                let progress_percent = if let Some(dur) = duration {
                    if dur > 0.0 {
                        ((progress_val / dur) * 100.0).round() as i64
                    } else {
                        0
                    }
                } else {
                    0
                };

                let audio_size: Option<f64> = row.get(21)?;

                Ok(EpisodeInfo {
                    id,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    image: row.get(4)?,
                    duration,
                    pub_date: row.get(6)?,
                    play_count: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    comment_count: row.get::<_, Option<i64>>(8)?.unwrap_or(0),
                    is_favorited: row.get::<_, Option<i64>>(9)?.unwrap_or(0) == 1,
                    is_finished: row.get::<_, Option<i64>>(10)?.unwrap_or(0) == 1,
                    podcast_id: row.get(12)?,
                    podcast_title: row.get(13)?,
                    podcast_author: row.get(14)?,
                    podcast_description: row.get(15)?,
                    podcast_image: row.get(16)?,
                    subscription_count: row.get::<_, Option<i64>>(17)?.unwrap_or(0),
                    audio_eid: row.get(18)?,
                    audio_filename,
                    audio_url: row.get(20)?,
                    audio_size: audio_size.map(|s| (s * 1024.0 * 1024.0) as i64).unwrap_or(0),
                    audio_key: row.get(22)?,
                    local_path,
                    is_downloaded,
                    local_file_size,
                    local_file_format,
                    progress: progress_val,
                    progress_percent,
                    last_played: row.get(24)?,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            match row {
                Ok(info) => results.push(info),
                Err(e) => eprintln!("解析行失败: {}", e),
            }
        }

        Ok(results)
    }

    /// 获取数据库统计信息
    pub fn get_statistics(db_path: &str) -> Result<super::DbStatistics, String> {
        let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("数据库连接失败: {}", e))?;

        let audio_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM AudioFileTable_v2", [], |row| row.get(0))
            .unwrap_or(0);

        let playlist_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM Playlist", [], |row| row.get(0))
            .unwrap_or(0);

        let podcast_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM PlaylistPodcast", [], |row| row.get(0))
            .unwrap_or(0);

        let total_duration: f64 = conn
            .query_row("SELECT COALESCE(SUM(duration), 0) FROM Playlist", [], |row| row.get(0))
            .unwrap_or(0.0);

        Ok(super::DbStatistics {
            audio_file_count: audio_count,
            playlist_count,
            podcast_count,
            total_duration,
        })
    }

    /// 构建文件名前缀映射缓存
    fn build_file_name_cache(audio_dir: &str) -> HashMap<String, String> {
        let mut cache = HashMap::new();
        let dir_path = Path::new(audio_dir);

        if !dir_path.exists() {
            return cache;
        }

        let entries = match fs::read_dir(dir_path) {
            Ok(entries) => entries,
            Err(_) => return cache,
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();

            // 跳过非音频文件
            let lower = file_name.to_lowercase();
            if !lower.ends_with(".m4a")
                && !lower.ends_with(".mp3")
                && !lower.ends_with(".wav")
                && !lower.ends_with(".aac")
            {
                continue;
            }

            // 移除扩展名获取哈希部分
            let name_without_ext = if let Some(pos) = file_name.rfind('.') {
                &file_name[..pos]
            } else {
                &file_name
            };

            // 遍历所有可能的前缀长度
            let max_prefix = name_without_ext.len().min(32);
            for prefix_len in 20..=max_prefix {
                let prefix = &name_without_ext[..prefix_len];
                cache.entry(prefix.to_string()).or_insert_with(|| file_name.clone());
            }

            // 完整哈希名也作为 key
            cache.entry(name_without_ext.to_string()).or_insert(file_name);
        }

        cache
    }

    /// 根据单集 ID 查找本地文件
    fn find_local_file(
        episode_id: &str,
        audio_filename: Option<&str>,
        file_cache: &HashMap<String, String>,
        audio_dir: Option<&Path>,
    ) -> (Option<String>, bool, u64, String) {
        let audio_dir = match audio_dir {
            Some(dir) => dir,
            None => return (None, false, 0, String::new()),
        };

        // 方法1: 使用单集 ID 作为前缀查找
        if let Some(matched_file) = file_cache.get(episode_id) {
            let potential_path = audio_dir.join(matched_file);
            if potential_path.exists() {
                let ext = potential_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("m4a")
                    .to_string();
                let size = fs::metadata(&potential_path)
                    .map(|m| m.len())
                    .unwrap_or(0);
                return (
                    Some(potential_path.to_string_lossy().to_string()),
                    true,
                    size,
                    ext,
                );
            }
        }

        // 方法2: 使用数据库中的 audio_filename
        if let Some(filename) = audio_filename {
            let potential_path = audio_dir.join(filename);
            if potential_path.exists() {
                let ext = potential_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("m4a")
                    .to_string();
                let size = fs::metadata(&potential_path)
                    .map(|m| m.len())
                    .unwrap_or(0);
                return (
                    Some(potential_path.to_string_lossy().to_string()),
                    true,
                    size,
                    ext,
                );
            }
        }

        (None, false, 0, String::new())
    }
}
