import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { ConversionTask, AppConfig } from '../../types';
import { randomUUID } from 'crypto';

export class AudioProcessor {
  private activeTasks: Map<string, ConversionTask> = new Map();
  private taskQueue: ConversionTask[] = [];
  private isProcessing = false;
  
  // 回调函数
  public onProgress?: (taskId: string, progress: number) => void;
  public onComplete?: (taskId: string, outputPath: string) => void;
  public onError?: (taskId: string, error: string) => void;

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
   * 转换多个音频文件
   */
  async convertFiles(
    filePaths: string[], 
    outputDirectory: string, 
    config: AppConfig
  ): Promise<ConversionTask[]> {
    // 确保输出目录存在
    await this.ensureDirectoryExists(outputDirectory);

    // 创建转换任务
    const tasks: ConversionTask[] = filePaths.map(filePath => ({
      id: randomUUID(),
      sourceFile: filePath,
      targetFile: this.generateOutputPath(filePath, outputDirectory),
      status: 'pending',
      progress: 0,
      createdAt: new Date()
    }));

    // 添加到任务队列
    this.taskQueue.push(...tasks);
    tasks.forEach(task => this.activeTasks.set(task.id, task));

    // 开始处理队列
    this.processQueue(config);

    return tasks;
  }

  /**
   * 处理任务队列
   */
  private async processQueue(config: AppConfig): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const maxConcurrent = config.maxConcurrentTasks || 3;
    const processingTasks: Promise<void>[] = [];

    while (this.taskQueue.length > 0 || processingTasks.length > 0) {
      // 启动新任务直到达到最大并发数
      while (this.taskQueue.length > 0 && processingTasks.length < maxConcurrent) {
        const task = this.taskQueue.shift()!;
        const taskPromise = this.processTask(task, config)
          .finally(() => {
            // 从处理中的任务列表中移除
            const index = processingTasks.indexOf(taskPromise);
            if (index > -1) {
              processingTasks.splice(index, 1);
            }
          });
        
        processingTasks.push(taskPromise);
      }

      // 等待至少一个任务完成
      if (processingTasks.length > 0) {
        await Promise.race(processingTasks);
      }
    }

    this.isProcessing = false;
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

      // 执行音频转换
      await this.convertAudioFile(task, config);

      // 任务完成
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
      this.activeTasks.set(task.id, task);

      if (this.onComplete) {
        this.onComplete(task.id, task.targetFile);
      }

    } catch (error: any) {
      // 任务失败
      task.status = 'failed';
      task.error = error?.message || 'Unknown error';
      this.activeTasks.set(task.id, task);

      if (this.onError) {
        this.onError(task.id, error?.message || 'Unknown error');
      }

      console.error(`转换任务失败 [${task.id}]:`, error);
    }
  }

  /**
   * 转换单个音频文件
   */
  private async convertAudioFile(task: ConversionTask, config: AppConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(task.sourceFile);

      // 设置音频质量
      const bitrateMap = {
        low: '128k',
        medium: '192k',
        high: '320k'
      };
      
      const bitrate = bitrateMap[config.audioQuality] || '192k';

      command
        .audioBitrate(bitrate)
        .audioCodec('libmp3lame')
        .format('mp3')
        .output(task.targetFile)
        .on('start', (commandLine) => {
          console.log(`开始转换: ${task.sourceFile}`);
          console.log(`FFmpeg命令: ${commandLine}`);
        })
        .on('progress', (progress) => {
          // 更新进度
          const percent = Math.min(progress.percent || 0, 100);
          task.progress = percent;
          this.activeTasks.set(task.id, task);

          if (this.onProgress) {
            this.onProgress(task.id, percent);
          }
        })
        .on('end', () => {
          console.log(`转换完成: ${task.targetFile}`);
          resolve();
        })
        .on('error', (error) => {
          console.error(`转换失败: ${task.sourceFile}`, error);
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

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
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
      const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
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