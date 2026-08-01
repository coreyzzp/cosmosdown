import * as sqlite3 from 'sqlite3';
import { AudioFileInfo, DatabaseConfig } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig | null = null;

  /**
   * 连接到SQLite数据库
   */
  async connect(dbPath: string, readonly: boolean = true): Promise<void> {
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

      this.config = { path: dbPath, readonly };
      
      const mode = readonly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
      
      this.db = new sqlite3.Database(dbPath, mode, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          reject(new Error(`数据库连接失败: ${err.message}`));
        } else {
          console.log(`数据库连接成功: ${dbPath}`);
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
            this.config = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 获取音频文件列表
   * 这个方法需要根据你的数据库结构进行调整
   */
  async getAudioFiles(): Promise<AudioFileInfo[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      // 首先尝试获取表结构信息
      this.db!.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, tables) => {
          if (err) {
            reject(new Error(`获取表信息失败: ${err.message}`));
            return;
          }

          console.log('数据库中的表:', tables);

          // 尝试几种常见的表名和字段名组合
          const possibleQueries = [
            // 标准音频文件表结构
            `SELECT 
              id, 
              file_path as originalPath, 
              file_name as fileName, 
              file_size as fileSize,
              duration,
              format,
              created_at as createdAt,
              updated_at as updatedAt
            FROM audio_files 
            WHERE file_path IS NOT NULL AND file_path != ''`,

            // 通用文件表结构
            `SELECT 
              id, 
              path as originalPath, 
              name as fileName, 
              size as fileSize,
              duration,
              type as format,
              created_time as createdAt,
              modified_time as updatedAt
            FROM files 
            WHERE (type LIKE '%audio%' OR path LIKE '%.mp3' OR path LIKE '%.wav' OR path LIKE '%.flac' OR path LIKE '%.m4a')
            AND path IS NOT NULL AND path != ''`,

            // 媒体文件表结构
            `SELECT 
              id, 
              file_path as originalPath, 
              filename as fileName, 
              filesize as fileSize,
              duration,
              mime_type as format,
              date_created as createdAt,
              date_modified as updatedAt
            FROM media_files 
            WHERE (mime_type LIKE '%audio%' OR file_path LIKE '%.mp3' OR file_path LIKE '%.wav' OR file_path LIKE '%.flac' OR file_path LIKE '%.m4a')
            AND file_path IS NOT NULL AND file_path != ''`,

            // 简单的文件路径表
            `SELECT 
              rowid as id,
              file_path as originalPath,
              file_path as fileName,
              0 as fileSize,
              NULL as duration,
              NULL as format,
              datetime('now') as createdAt,
              datetime('now') as updatedAt
            FROM file_paths 
            WHERE (file_path LIKE '%.mp3' OR file_path LIKE '%.wav' OR file_path LIKE '%.flac' OR file_path LIKE '%.m4a')
            AND file_path IS NOT NULL AND file_path != ''`,

            // 通用路径表
            `SELECT 
              rowid as id,
              path as originalPath,
              path as fileName,
              0 as fileSize,
              NULL as duration,
              NULL as format,
              datetime('now') as createdAt,
              datetime('now') as updatedAt
            FROM paths 
            WHERE (path LIKE '%.mp3' OR path LIKE '%.wav' OR path LIKE '%.flac' OR path LIKE '%.m4a')
            AND path IS NOT NULL AND path != ''`
          ];

          // 尝试执行查询
          this.tryQueries(possibleQueries, 0, resolve, reject);
        }
      );
    });
  }

  /**
   * 递归尝试不同的查询语句
   */
  private tryQueries(
    queries: string[], 
    index: number, 
    resolve: (files: AudioFileInfo[]) => void, 
    reject: (error: Error) => void
  ): void {
    if (index >= queries.length) {
      // 如果所有查询都失败了，尝试获取所有表的结构
      this.analyzeDatabase(resolve, reject);
      return;
    }

    const query = queries[index];
    console.log(`尝试查询 ${index + 1}:`, query);

    this.db!.all(query, (err, rows: any[]) => {
      if (err) {
        console.log(`查询 ${index + 1} 失败:`, err.message);
        // 尝试下一个查询
        this.tryQueries(queries, index + 1, resolve, reject);
      } else {
        console.log(`查询 ${index + 1} 成功，找到 ${rows.length} 条记录`);
        
        if (rows.length === 0) {
          // 如果查询成功但没有数据，尝试下一个查询
          this.tryQueries(queries, index + 1, resolve, reject);
        } else {
          // 处理查询结果
          const audioFiles: AudioFileInfo[] = rows.map((row, idx) => ({
            id: row.id || idx + 1,
            originalPath: row.originalPath || '',
            fileName: this.extractFileName(row.originalPath || row.fileName || ''),
            fileSize: parseInt(row.fileSize) || 0,
            duration: parseFloat(row.duration) || undefined,
            format: row.format || this.extractFileExtension(row.originalPath || ''),
            createdAt: new Date(row.createdAt || Date.now()),
            updatedAt: new Date(row.updatedAt || Date.now())
          }));

          resolve(audioFiles);
        }
      }
    });
  }

  /**
   * 分析数据库结构
   */
  private analyzeDatabase(
    resolve: (files: AudioFileInfo[]) => void, 
    reject: (error: Error) => void
  ): void {
    this.db!.all(
      `SELECT 
        m.name as table_name,
        p.name as column_name,
        p.type as column_type
      FROM sqlite_master m
      LEFT OUTER JOIN pragma_table_info((m.name)) p ON m.name <> p.name
      WHERE m.type = 'table'
      ORDER BY m.name, p.cid`,
      (err, schema) => {
        if (err) {
          reject(new Error(`分析数据库结构失败: ${err.message}`));
          return;
        }

        console.log('数据库结构分析:', schema);
        
        // 基于分析结果，尝试构建一个通用查询
        const tables = [...new Set(schema.map((s: any) => s.table_name))];
        console.log('可用的表:', tables);

        // 如果没有找到合适的数据，返回空数组
        resolve([]);
      }
    );
  }

  /**
   * 从完整路径中提取文件名
   */
  private extractFileName(filePath: string): string {
    if (!filePath) return '';
    return path.basename(filePath);
  }

  /**
   * 从文件路径中提取文件扩展名
   */
  private extractFileExtension(filePath: string): string {
    if (!filePath) return '';
    const ext = path.extname(filePath);
    return ext ? ext.substring(1).toLowerCase() : '';
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(filePath: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime
      };
    } catch {
      return null;
    }
  }

  /**
   * 执行自定义SQL查询（用于调试）
   */
  async executeQuery(query: string): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(query, (err, rows) => {
        if (err) {
          reject(new Error(`查询执行失败: ${err.message}`));
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 获取数据库信息
   */
  async getDatabaseInfo(): Promise<{
    path: string;
    size: number;
    tables: string[];
    version: string;
  }> {
    if (!this.db || !this.config) {
      throw new Error('数据库未连接');
    }

    const fileInfo = await this.getFileInfo(this.config.path);
    
    return new Promise((resolve, reject) => {
      // 获取表列表
      this.db!.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, tables) => {
          if (err) {
            reject(new Error(`获取表信息失败: ${err.message}`));
            return;
          }

          // 获取SQLite版本
          this.db!.get("SELECT sqlite_version() as version", (err, versionRow: any) => {
            if (err) {
              reject(new Error(`获取版本信息失败: ${err.message}`));
              return;
            }

            resolve({
              path: this.config!.path,
              size: fileInfo?.size || 0,
              tables: tables.map((t: any) => t.name),
              version: versionRow.version
            });
          });
        }
      );
    });
  }
}