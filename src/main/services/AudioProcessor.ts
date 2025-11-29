import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { ConversionTask, AppConfig } from '../../types';
import { randomUUID } from 'crypto';

export class AudioProcessor {
  private activeTasks: Map<string, ConversionTask> = new Map();
  private taskQueue: ConversionTask[] = [];
  private processingCount = 0; // 改用计数器而不是布尔标志
  
  // 为每个任务单独存储回调函数
  private progressCallbacks: Map<string, (progress: number) => void> = new Map();
  private completeCallbacks: Map<string, (outputPath: string) => void> = new Map();
  private errorCallbacks: Map<string, (error: string) => void> = new Map();

  constructor() {
    // 尝试设置FFmpeg路径（如果系统中安装了FFmpeg）
    this.setupFFmpegPath();
  }

  /**
   * 设置FFmpeg路径
   */
  private setupFFmpegPath(): void {
    try {
      // 在macOS上，FFmpeg通常通过Homebrew安装在这些位置
      const possiblePaths = [
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/bin/ffmpeg',
        'ffmpeg' // 系统PATH中
      ];

      for (const ffmpegPath of possiblePaths) {
        try {
          if (ffmpegPath === 'ffmpeg' || fs.existsSync(ffmpegPath)) {
            ffmpeg.setFfmpegPath(ffmpegPath);
            console.log(`FFmpeg路径设置为: ${ffmpegPath}`);
            break;
          }
        } catch (err) {
          continue;
        }
      }
    } catch (err) {
      console.warn('无法设置FFmpeg路径，请确保系统中已安装FFmpeg');
    }
  }

  /**
   * 设置任务回调
   */
  setTaskCallbacks(
    taskId: string,
    callbacks: {
      onProgress?: (progress: number) => void;
      onComplete?: (outputPath: string) => void;
      onError?: (error: string) => void;
    }
  ): void {
    if (callbacks.onProgress) {
      this.progressCallbacks.set(taskId, callbacks.onProgress);
    }
    if (callbacks.onComplete) {
      this.completeCallbacks.set(taskId, callbacks.onComplete);
    }
    if (callbacks.onError) {
      this.errorCallbacks.set(taskId, callbacks.onError);
    }
  }

  /**
   * 转换多个音频文件
   */
  async convertFiles(
    filePaths: string[], 
    outputDirectory: string, 
    config: AppConfig,
    customTaskId?: string,
    customOutputFilename?: string,
    metadata?: {
      title?: string;
      artist?: string;
      album?: string;
      comment?: string;
      coverUrl?: string;
    }
  ): Promise<ConversionTask[]> {
    // 确保输出目录存在
    await this.ensureDirectoryExists(outputDirectory);

    // 创建转换任务
    const tasks: ConversionTask[] = filePaths.map(filePath => {
      const taskId = customTaskId || randomUUID();
      const targetFile = customOutputFilename 
        ? path.join(outputDirectory, customOutputFilename)
        : this.generateOutputPath(filePath, outputDirectory);
      
      return {
        id: taskId,
        sourceFile: filePath,
        targetFile,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
        metadata // 保存元数据
      };
    });

    // 添加到任务队列
    this.taskQueue.push(...tasks);
    tasks.forEach(task => this.activeTasks.set(task.id, task));

    // 开始处理队列（不等待，让它异步处理）
    this.processQueue(config);

    return tasks;
  }

  /**
   * 处理任务队列（改进版本，支持真正的并行）
   */
  private async processQueue(config: AppConfig): Promise<void> {
    const maxConcurrent = config.maxConcurrentTasks || 5;

    // 启动新任务直到达到最大并发数
    while (this.taskQueue.length > 0 && this.processingCount < maxConcurrent) {
      const task = this.taskQueue.shift()!;
      this.processingCount++;
      
      console.log(`启动新转换任务 [${task.id}], 当前并发数: ${this.processingCount}/${maxConcurrent}`);
      
      // 异步处理任务，不等待
      this.processTask(task, config)
        .finally(() => {
          this.processingCount--;
          console.log(`任务完成 [${task.id}], 当前并发数: ${this.processingCount}/${maxConcurrent}`);
          // 递归处理队列中的下一个任务
          this.processQueue(config);
        });
    }
  }

  /**
   * 处理单个转换任务
   */
  private async processTask(task: ConversionTask, config: AppConfig): Promise<void> {
    try {
      // 更新任务状态
      task.status = 'processing';
      this.activeTasks.set(task.id, task);

      // 检查源文件是否存在
      if (!fs.existsSync(task.sourceFile)) {
        throw new Error(`源文件不存在: ${task.sourceFile}`);
      }

      // 检查目标文件是否已存在
      if (fs.existsSync(task.targetFile)) {
        console.log(`目标文件已存在，将覆盖: ${task.targetFile}`);
      }

      // 下载封面图（如果有）
      let coverImagePath: string | undefined;
      if (task.metadata?.coverUrl) {
        try {
          coverImagePath = await this.downloadCoverImage(task.metadata.coverUrl, task.id);
          console.log(`封面图下载成功: ${coverImagePath}`);
        } catch (error) {
          console.warn(`封面图下载失败:`, error);
        }
      }

      // 执行音频转换（带元数据）
      await this.convertAudioFile(task, config, coverImagePath);

      // 清理临时封面图
      if (coverImagePath && fs.existsSync(coverImagePath)) {
        try {
          fs.unlinkSync(coverImagePath);
        } catch (err) {
          console.warn('清理临时封面图失败:', err);
        }
      }

      // 任务完成
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
      this.activeTasks.set(task.id, task);

      // 调用该任务的完成回调
      const onComplete = this.completeCallbacks.get(task.id);
      if (onComplete) {
        onComplete(task.targetFile);
        this.completeCallbacks.delete(task.id);
      }
      this.progressCallbacks.delete(task.id);
      this.errorCallbacks.delete(task.id);

    } catch (error: any) {
      // 任务失败
      task.status = 'failed';
      task.error = error?.message || 'Unknown error';
      this.activeTasks.set(task.id, task);

      // 调用该任务的错误回调
      const onError = this.errorCallbacks.get(task.id);
      if (onError) {
        onError(error?.message || 'Unknown error');
        this.errorCallbacks.delete(task.id);
      }
      this.progressCallbacks.delete(task.id);
      this.completeCallbacks.delete(task.id);

      console.error(`转换任务失败 [${task.id}]:`, error);
    }
  }

  /**
   * 下载封面图
   */
  private async downloadCoverImage(url: string, taskId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tmpDir = path.join(require('os').tmpdir(), 'miniubrowser');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const ext = url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)?.[1] || 'jpg';
      const tmpFile = path.join(tmpDir, `cover_${taskId}.${ext}`);
      const file = fs.createWriteStream(tmpFile);
      
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(tmpFile);
          });
        } else {
          file.close();
          fs.unlinkSync(tmpFile);
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
        }
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
        reject(err);
      });
    });
  }

  /**
   * 转换单个音频文件（带元数据）
   */
  private async convertAudioFile(
    task: ConversionTask, 
    config: AppConfig,
    coverImagePath?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(task.sourceFile);

      // 设置音频质量
      const bitrateMap = {
        low: '128k',
        medium: '192k',
        high: '320k'
      };
      
      const bitrate = bitrateMap[config.audioQuality] || '192k';

      // 基本配置
      command
        .audioBitrate(bitrate)
        .audioCodec('libmp3lame')
        .format('mp3');

      // 添加元数据
      if (task.metadata) {
        if (task.metadata.title) {
          command.outputOptions('-metadata', `title=${task.metadata.title}`);
        }
        if (task.metadata.artist) {
          command.outputOptions('-metadata', `artist=${task.metadata.artist}`);
        }
        if (task.metadata.album) {
          command.outputOptions('-metadata', `album=${task.metadata.album}`);
        }
        if (task.metadata.comment) {
          command.outputOptions('-metadata', `comment=${task.metadata.comment}`);
        }
      }

      // 添加封面图
      if (coverImagePath && fs.existsSync(coverImagePath)) {
        command
          .input(coverImagePath)
          .outputOptions('-map', '0:0') // 音频流
          .outputOptions('-map', '1:0') // 图片流
          .outputOptions('-c:v', 'mjpeg') // 使用MJPEG编码图片
          .outputOptions('-id3v2_version', '3') // 使用ID3v2.3
          .outputOptions('-metadata:s:v', 'title=Album cover')
          .outputOptions('-metadata:s:v', 'comment=Cover (front)');
      }

      command
        .output(task.targetFile)
        .on('start', (commandLine) => {
          console.log(`开始转换 [${task.id}]: ${task.sourceFile}`);
          console.log(`FFmpeg命令: ${commandLine}`);
        })
        .on('progress', (progress) => {
          // 更新进度
          const percent = Math.min(progress.percent || 0, 100);
          task.progress = percent;
          this.activeTasks.set(task.id, task);

          // 调用该任务的进度回调
          const onProgress = this.progressCallbacks.get(task.id);
          if (onProgress) {
            onProgress(percent);
          }
        })
        .on('end', () => {
          console.log(`转换完成 [${task.id}]: ${task.targetFile}`);
          resolve();
        })
        .on('error', (error) => {
          console.error(`转换失败 [${task.id}]: ${task.sourceFile}`, error);
          reject(new Error(`FFmpeg转换失败: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * 生成输出文件路径
   */
  private generateOutputPath(sourceFile: string, outputDirectory: string): string {
    const fileName = path.basename(sourceFile, path.extname(sourceFile));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = `${fileName}_converted_${timestamp}.mp3`;
    return path.join(outputDirectory, outputFileName);
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(directory: string): Promise<void> {
    try {
      await fs.promises.access(directory);
    } catch (error) {
      await fs.promises.mkdir(directory, { recursive: true });
    }
  }

  /**
   * 获取音频文件信息
   */
  async getAudioInfo(filePath: string): Promise<{
    duration: number;
    bitrate: number;
    format: string;
    channels: number;
    sampleRate: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`获取音频信息失败: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('未找到音频流'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          bitrate: parseInt(metadata.format.bit_rate || '0'),
          format: metadata.format.format_name || '',
          channels: audioStream.channels || 0,
          sampleRate: audioStream.sample_rate || 0
        });
      });
    });
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;

    if (task.status === 'pending') {
      // 从队列中移除
      const queueIndex = this.taskQueue.findIndex((t: ConversionTask) => t.id === taskId);
      if (queueIndex > -1) {
        this.taskQueue.splice(queueIndex, 1);
      }
      
      task.status = 'cancelled';
      this.activeTasks.set(taskId, task);
      return true;
    }

    return false;
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): ConversionTask | undefined {
    return this.activeTasks.get(taskId);
  }

  /**
   * 获取所有任务状态
   */
  getAllTasks(): ConversionTask[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 清理已完成的任务
   */
  clearCompletedTasks(): void {
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.activeTasks.delete(taskId);
      }
    }
  }

  /**
   * 检查FFmpeg是否可用
   */
  async checkFFmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        ffmpeg()
          .input('dummy')
          .on('error', (err: any) => {
            if (err.message && err.message.includes('ffmpeg')) {
              resolve(false);
            } else {
              resolve(true);
            }
          })
          .on('start', () => {
            resolve(true);
          });
      } catch (error) {
        resolve(false);
      }
    });
  }

  /**
   * 获取支持的音频格式
   */
  getSupportedFormats(): string[] {
    return [
      'mp3', 'wav', 'flac', 'm4a', 'aac', 
      'ogg', 'wma', 'aiff', 'au', 'ra'
    ];
  }
}
