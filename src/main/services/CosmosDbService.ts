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

  /**
   * 连接到 Cosmos 数据库
   */
  async connect(dbPath: string): Promise<void> {
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
      
      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          reject(new Error(`数据库连接失败: ${err.message}`));
        } else {
          console.log(`Cosmos 数据库连接成功: ${dbPath}`);
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