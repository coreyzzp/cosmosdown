use std::fs;
use std::path::Path;
use std::process::Command;

use super::AppConfig;

/// 音频处理器
/// 使用系统 FFmpeg 进行音频转换
pub struct AudioProcessor;

impl AudioProcessor {
    /// 查找 FFmpeg 路径
    fn find_ffmpeg() -> Option<String> {
        let possible_paths = [
            "/usr/local/bin/ffmpeg",
            "/opt/homebrew/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ];

        for path in &possible_paths {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        // 尝试从 PATH 中查找
        if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }

        None
    }

    /// 转换音频文件为 MP3
    pub fn convert_to_mp3(
        source_path: &str,
        output_path: &str,
        config: &AppConfig,
        metadata: Option<&AudioMetadata>,
    ) -> Result<(), String> {
        let ffmpeg_path = Self::find_ffmpeg()
            .ok_or_else(|| "未找到 FFmpeg，请确保系统中已安装 FFmpeg".to_string())?;

        // 确保输出目录存在
        if let Some(parent) = Path::new(output_path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建输出目录失败: {}", e))?;
        }

        // 确定比特率
        let bitrate = match config.audio_quality.as_str() {
            "low" => "128k",
            "high" => "320k",
            _ => "192k",
        };

        let mut cmd = Command::new(&ffmpeg_path);
        cmd.arg("-y") // 覆盖已有文件
            .arg("-i")
            .arg(source_path)
            .arg("-ab")
            .arg(bitrate)
            .arg("-acodec")
            .arg("libmp3lame")
            .arg("-f")
            .arg("mp3");

        // 添加元数据
        if let Some(meta) = metadata {
            if let Some(ref title) = meta.title {
                cmd.arg("-metadata").arg(format!("title={}", title));
            }
            if let Some(ref artist) = meta.artist {
                cmd.arg("-metadata").arg(format!("artist={}", artist));
            }
            if let Some(ref album) = meta.album {
                cmd.arg("-metadata").arg(format!("album={}", album));
            }
            if let Some(ref comment) = meta.comment {
                cmd.arg("-metadata").arg(format!("comment={}", comment));
            }
        }

        cmd.arg(output_path);

        let output = cmd.output().map_err(|e| format!("执行 FFmpeg 失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpeg 转换失败: {}", stderr));
        }

        Ok(())
    }

    /// 清理文件名，移除不安全字符
    pub fn sanitize_filename(filename: &str) -> String {
        let sanitized: String = filename
            .chars()
            .filter(|c| !['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(c))
            .collect();

        let sanitized = sanitized
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join("_");

        // 限制长度
        if sanitized.len() > 200 {
            sanitized[..200].to_string()
        } else {
            sanitized
        }
    }
}

/// 音频元数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub comment: Option<String>,
    pub cover_url: Option<String>,
}
