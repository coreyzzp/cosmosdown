import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  AudioFile,
  Playlist,
  PlaylistPodcast,
  PlaylistProgress,
  PlaylistWithDetails,
  AudioFileWithLocal
} from '../../types/cosmos-db';

/**
 * Cosmos 数据库服务
 * 专门用于读取和处理 Cosmos 数据库
 */
export class CosmosDbService {
  private db: sqlite3.Database | null = null;
  private dbPath: string | null = null;
  private audioFilePath: string | null = null; // 音频文件目录路径

  /**
   * 设置音频文件路径
   */
  setAudioFilePath(audioFilePath: string): void {
    this.audioFilePath = audioFilePath;
    console.log(`音频文件路径已设置: ${audioFilePath}`);
  }

  /**
   * 连接到 Cosmos 数据库
   */
  async connect(dbPath: string, audioFilePath?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 检查文件是否存在
      if (!fs.existsSync(dbPath)) {
        reject(new Error(`数据库文件不存在: ${dbPath}`));
        return;
      }

      // 关闭现有连接
      if (this.db) {
        this.db.close();
      }

      this.dbPath = dbPath;
      
      // 设置音频文件路径
      if (audioFilePath) {
        this.audioFilePath = audioFilePath;
      }
      
      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          reject(new Error(`数据库连接失败: ${err.message}`));
        } else {
          console.log(`Cosmos 数据库连接成功: ${dbPath}`);
          if (this.audioFilePath) {
            console.log(`音频文件目录: ${this.audioFilePath}`);
          }
          resolve();
        }
      });
    });
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(new Error(`关闭数据库失败: ${err.message}`));
          } else {
            this.db = null;
            this.dbPath = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 获取所有音频文件
   */
  async getAudioFiles(): Promise<AudioFile[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT url, eid, name, size, audioKey FROM AudioFileTable_v2',
        (err, rows: any[]) => {
          if (err) {
            reject(new Error(`获取音频文件失败: ${err.message}`));
          } else {
            const audioFiles: AudioFile[] = rows.map(row => ({
              url: row.url,
              eid: row.eid,
              name: row.name,
              size: row.size,
              audioKey: row.audioKey
            }));
            resolve(audioFiles);
          }
        }
      );
    });
  }

  /**
   * 获取所有播放列表/单集
   */
  async getPlaylists(): Promise<Playlist[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM Playlist',
        (err, rows: any[]) => {
          if (err) {
            reject(new Error(`获取播放列表失败: ${err.message}`));
          } else {
            resolve(rows as Playlist[]);
          }
        }
      );
    });
  }

  /**
   * 获取所有播客信息
   */
  async getPodcasts(): Promise<PlaylistPodcast[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM PlaylistPodcast',
        (err, rows: any[]) => {
          if (err) {
            reject(new Error(`获取播客信息失败: ${err.message}`));
          } else {
            resolve(rows as PlaylistPodcast[]);
          }
        }
      );
    });
  }

  /**
   * 获取播放进度
   */
  async getProgress(): Promise<PlaylistProgress[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM PlaylistProgress',
        (err, rows: any[]) => {
          if (err) {
            reject(new Error(`获取播放进度失败: ${err.message}`));
          } else {
            resolve(rows as PlaylistProgress[]);
          }
        }
      );
    });
  }

  /**
   * 获取播放列表详细信息（包含关联的播客和音频文件）
   */
  async getPlaylistsWithDetails(): Promise<PlaylistWithDetails[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          p.*,
          pp.title as podcast_title,
          pp.author as podcast_author,
          pp.image as podcast_image
        FROM Playlist p
        LEFT JOIN PlaylistPodcast pp ON p.pid = pp.id
        ORDER BY p.pubDate DESC
      `;

      this.db!.all(query, (err, rows: any[]) => {
        if (err) {
          reject(new Error(`获取播放列表详情失败: ${err.message}`));
        } else {
          const playlists: PlaylistWithDetails[] = rows.map(row => {
            const playlist: PlaylistWithDetails = {
              id: row.id,
              pid: row.pid,
              status: row.status,
              reviewStatus: row.reviewStatus,
              visibility: row.visibility,
              title: row.title,
              description: row.description,
              shownotes: row.shownotes,
              image: row.image,
              commentCount: row.commentCount,
              playCount: row.playCount,
              duration: row.duration,
              pubDate: row.pubDate,
              isFavorited: row.isFavorited,
              isFinished: row.isFinished,
              isPicked: row.isPicked,
              permissions: row.permissions,
              payType: row.payType,
              isOwned: row.isOwned,
              trialInfo: row.trialInfo,
              wechatShareStyle: row.wechatShareStyle,
              wechatShareUrl: row.wechatShareUrl,
              pilotInfo: row.pilotInfo,
              media: row.media,
              isCustomized: row.isCustomized,
              riskWarning: row.riskWarning,
              topicId: row.topicId
            };

            // 添加播客信息
            if (row.podcast_title) {
              playlist.podcast = {
                id: row.pid,
                title: row.podcast_title,
                author: row.podcast_author,
                image: row.podcast_image
              } as PlaylistPodcast;
            }

            return playlist;
          });
          resolve(playlists);
        }
      });
    });
  }

  /**
   * 根据音频文件名查找对应的 URL
   * 这是核心功能：通过文件名匹配找到对应的在线 URL
   */
  async findAudioUrlByFileName(fileName: string): Promise<string | null> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT url FROM AudioFileTable_v2 WHERE name = ?',
        [fileName],
        (err, row: any) => {
          if (err) {
            reject(new Error(`查找音频 URL 失败: ${err.message}`));
          } else {
            resolve(row ? row.url : null);
          }
        }
      );
    });
  }

  /**
   * 获取音频文件的本地路径（基于数据库所在目录推测）
   */
  async getAudioFilesWithLocalPaths(): Promise<AudioFileWithLocal[]> {
    const audioFiles = await this.getAudioFiles();
    
    if (!this.dbPath) {
      return audioFiles.map(file => ({
        ...file,
        isDownloaded: false
      }));
    }

    // 推测音频文件可能存储的目录（通常在数据库同级或上级目录）
    const dbDir = path.dirname(this.dbPath);
    const possibleAudioDirs = [
      path.join(dbDir, 'audio'),
      path.join(dbDir, 'files'),
      path.join(dbDir, '..', 'audio'),
      path.join(dbDir, '..', 'files'),
      dbDir
    ];

    return audioFiles.map(file => {
      let localPath: string | undefined;
      let isDownloaded = false;

      // 尝试在可能的目录中查找文件
      for (const dir of possibleAudioDirs) {
        const potentialPath = path.join(dir, file.name);
        if (fs.existsSync(potentialPath)) {
          localPath = potentialPath;
          isDownloaded = true;
          break;
        }
      }

      return {
        ...file,
        localPath,
        isDownloaded
      };
    });
  }

  /**
   * 获取完整的播客单集信息
   * 正确的关联逻辑：
   * 1. Playlist (播放列表/单集) 是主表，每一行代表一个播客单集
   * 2. Playlist.pid → PlaylistPodcast.id (单集属于哪个播客频道)
   * 3. Playlist.media JSON → AudioFileTable_v2.url (单集对应的音频文件)
   * 4. PlaylistProgress.id → Playlist.id (播放进度)
   */
  async getPlaylistsWithFullInfo(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          -- 播放列表/单集信息
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
          
          -- 播客频道信息
          pp.id as podcast_id,
          pp.title as podcast_title,
          pp.author as podcast_author,
          pp.description as podcast_description,
          pp.image as podcast_image,
          pp.subscriptionCount,
          
          -- 音频文件信息（通过media JSON关联）
          a.eid as audio_eid,
          a.name as audio_filename,
          a.url as audio_url,
          a.size as audio_size,
          a.audioKey as audio_key,
          
          -- 播放进度
          pg.idProgress as progress,
          pg.playedAt as last_played
          
        FROM Playlist p
        LEFT JOIN PlaylistPodcast pp ON p.pid = pp.id
        LEFT JOIN AudioFileTable_v2 a ON json_extract(p.media, '$.enclosure.url') = a.url
        LEFT JOIN PlaylistProgress pg ON p.id = pg.id
        
        ORDER BY p.pubDate DESC
      `;

      this.db!.all(query, (err, rows: any[]) => {
        if (err) {
          reject(new Error(`获取播放列表信息失败: ${err.message}`));
        } else {
          const results = rows.map(row => {
            // 查找本地文件路径
            let localPath = null;
            let isDownloaded = false;
            let localFileSize = 0;
            let localFileFormat = '';
            
            if (row.id) {
              // 使用配置的音频文件路径或回退到旧的推测逻辑
              let audioDir: string;
              
              if (this.audioFilePath) {
                // 新逻辑：使用设置的音频文件路径 /Documents/AudioFile/{userId}
                audioDir = this.audioFilePath;
              } else if (this.dbPath) {
                // 旧逻辑：从数据库路径推测
                // 数据库路径: .../{userId}/db/cosmos.db
                // 音频文件路径: .../AudioFile/{userId}
                const userDir = path.dirname(path.dirname(this.dbPath)); // 上两级到用户目录
                const documentsDir = path.dirname(userDir); // 再上一级到Documents
                const userId = path.basename(userDir);
                audioDir = path.join(documentsDir, 'AudioFile', userId);
              } else {
                audioDir = '';
              }
              
              if (audioDir) {
                // 尝试多种可能的文件扩展名
                const possibleExtensions = ['m4a', 'mp3', 'wav', 'aac'];
                
                for (const ext of possibleExtensions) {
                  const potentialPath = path.join(audioDir, `${row.id}.${ext}`);
                  if (fs.existsSync(potentialPath)) {
                    localPath = potentialPath;
                    isDownloaded = true;
                    localFileFormat = ext;
                    
                    // 获取文件大小
                    try {
                      const stats = fs.statSync(potentialPath);
                      localFileSize = stats.size;
                    } catch (e) {
                      console.error('获取文件大小失败:', e);
                    }
                    break;
                  }
                }
              }
            }

            return {
              // 唯一标识
              id: row.id,
              
              // 单集信息（用户可见的主要信息）
              title: row.title,
              description: row.description,
              image: row.image,
              duration: row.duration,
              pubDate: row.pubDate,
              playCount: row.playCount || 0,
              commentCount: row.commentCount || 0,
              isFavorited: row.isFavorited === 1,
              isFinished: row.isFinished === 1,
              
              // 播客频道信息
              podcastId: row.podcast_id,
              podcastTitle: row.podcast_title,
              podcastAuthor: row.podcast_author,
              podcastDescription: row.podcast_description,
              podcastImage: row.podcast_image,
              subscriptionCount: row.subscriptionCount || 0,
              
              // 音频文件信息（技术细节，hover显示）
              audioEid: row.audio_eid,
              audioFilename: row.audio_filename,
              audioUrl: row.audio_url,
              audioSize: row.audio_size ? row.audio_size * 1024 * 1024 : 0, // MB转字节
              audioKey: row.audio_key,
              
              // 本地文件信息
              localPath,
              isDownloaded,
              localFileSize,
              localFileFormat,
              
              // 播放进度
              progress: row.progress || 0,
              progressPercent: row.duration > 0 ? Math.round((row.progress / row.duration) * 100) : 0,
              lastPlayed: row.last_played
            };
          });
          
          resolve(results);
        }
      });
    });
  }

  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{
    audioFileCount: number;
    playlistCount: number;
    podcastCount: number;
    totalDuration: number;
  }> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as count FROM AudioFileTable_v2',
        'SELECT COUNT(*) as count FROM Playlist',
        'SELECT COUNT(*) as count FROM PlaylistPodcast',
        'SELECT SUM(duration) as total FROM Playlist'
      ];

      Promise.all(
        queries.map(query => 
          new Promise<number>((res, rej) => {
            this.db!.get(query, (err, row: any) => {
              if (err) rej(err);
              else res(row.count || row.total || 0);
            });
          })
        )
      ).then(results => {
        resolve({
          audioFileCount: results[0],
          playlistCount: results[1],
          podcastCount: results[2],
          totalDuration: results[3]
        });
      }).catch(reject);
    });
  }
}