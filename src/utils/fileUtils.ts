import * as fs from 'fs';
import * as path from 'path';

/**
 * 文件工具类
 */
export class FileUtils {
  /**
   * 检查文件是否存在
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 确保目录存在，如果不存在则创建
   */
  static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 获取文件大小（字节）
   */
  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * 格式化文件大小为可读格式
   */
  static formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${Math.round(size * 100) / 100} ${sizes[i]}`;
  }

  /**
   * 获取文件扩展名
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase().substring(1);
  }

  /**
   * 检查是否为音频文件
   */
  static isAudioFile(filePath: string): boolean {
    const audioExtensions = [
      'mp3', 'wav', 'flac', 'm4a', 'aac', 
      'ogg', 'wma', 'aiff', 'au', 'ra'
    ];
    const extension = this.getFileExtension(filePath);
    return audioExtensions.includes(extension);
  }

  /**
   * 生成安全的文件名（移除特殊字符）
   */
  static sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
  }

  /**
   * 获取不重复的文件路径
   */
  static async getUniqueFilePath(filePath: string): Promise<string> {
    if (!(await this.exists(filePath))) {
      return filePath;
    }

    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    let counter = 1;
    let newPath: string;

    do {
      newPath = path.join(dir, `${name}_${counter}${ext}`);
      counter++;
    } while (await this.exists(newPath));

    return newPath;
  }

  /**
   * 复制文件
   */
  static async copyFile(source: string, destination: string): Promise<void> {
    await fs.promises.copyFile(source, destination);
  }

  /**
   * 移动文件
   */
  static async moveFile(source: string, destination: string): Promise<void> {
    await fs.promises.rename(source, destination);
  }

  /**
   * 删除文件
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // 忽略文件不存在的错误
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 读取目录中的所有文件
   */
  static async readDirectory(dirPath: string, recursive: boolean = false): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory() && recursive) {
          const subFiles = await this.readDirectory(fullPath, true);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`读取目录失败: ${dirPath}`, error);
    }
    
    return files;
  }

  /**
   * 获取文件的修改时间
   */
  static async getModificationTime(filePath: string): Promise<Date | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.mtime;
    } catch {
      return null;
    }
  }

  /**
   * 创建临时文件路径
   */
  static createTempFilePath(extension: string = '.tmp'): string {
    const tempDir = require('os').tmpdir();
    const fileName = `miniubrowser_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
    return path.join(tempDir, fileName);
  }
}