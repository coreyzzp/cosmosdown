import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DatabaseService } from './services/DatabaseService';
import { AudioProcessor }  from './services/AudioProcessor';
import { CosmosDbService } from './services/CosmosDbService';
import { XiaoyuzhouDetector, XiaoyuzhouAppInfo } from './services/XiaoyuzhouDetector';
import { RendererToMainMessage, MainToRendererMessage, AppConfig } from '../types';

class MainProcess {
  private mainWindow: BrowserWindow | null = null;
  private databaseService: DatabaseService;
  private cosmosDbService: CosmosDbService;
  private audioProcessor: AudioProcessor;
  private xiaoyuzhouDetector: XiaoyuzhouDetector;
  private xiaoyuzhouAppInfo: XiaoyuzhouAppInfo | null = null;
  private appConfig: AppConfig = {
    database: { path: '', readonly: true },
    outputDirectory: '',
    audioQuality: 'medium',
    maxConcurrentTasks: 3
  };

  constructor() {
    this.databaseService = new DatabaseService();
    this.cosmosDbService = new CosmosDbService();
    this.audioProcessor = new AudioProcessor();
    this.xiaoyuzhouDetector = new XiaoyuzhouDetector();
    this.setupApp();
    this.setupIPC();
  }

  private setupApp(): void {
    app.whenReady().then(async () => {
      // 自动检测小宇宙应用
      await this.detectAndConnectXiaoyuzhou();
      
      this.createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      titleBarStyle: 'hiddenInset',
      show: false
    });

    // 开发环境加载本地文件，生产环境可以加载打包后的文件
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      this.mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // 窗口显示后，如果已自动连接，通知渲染进程
      if (this.xiaoyuzhouAppInfo) {
        this.notifyAutoConnected();
      }
    });
  }

  /**
   * 自动检测并连接小宇宙应用
   */
  private async detectAndConnectXiaoyuzhou(): Promise<void> {
    try {
      console.log('🔍 正在检测小宇宙应用...');
      const appInfo = await this.xiaoyuzhouDetector.detectXiaoyuzhouApp();
      
      if (!appInfo) {
        console.log('⚠️  未检测到小宇宙应用，将使用手动选择模式');
        return;
      }

      this.xiaoyuzhouAppInfo = appInfo;
      console.log('\n📱 小宇宙应用信息:');
      console.log(this.xiaoyuzhouDetector.formatAppInfo(appInfo));

      // 获取推荐用户
      const recommendedUser = this.xiaoyuzhouDetector.getRecommendedUser(appInfo);
      if (!recommendedUser) {
        console.log('⚠️  未找到有效用户数据');
        return;
      }

      // 自动连接数据库
      console.log(`\n🔌 正在连接数据库: ${recommendedUser.dbPath}`);
      await this.cosmosDbService.connect(
        recommendedUser.dbPath,
        recommendedUser.audioFilePath
      );

      this.appConfig.database.path = recommendedUser.dbPath;
      
      // 获取统计信息
      const stats = await this.cosmosDbService.getStatistics();
      console.log('📊 数据库统计:', stats);
      console.log('✅ 自动连接成功！\n');
    } catch (error: any) {
      console.error('❌ 自动检测失败:', error.message);
      console.log('将使用手动选择模式\n');
    }
  }

  /**
   * 通知渲染进程自动连接成功
   */
  private notifyAutoConnected(): void {
    if (!this.xiaoyuzhouAppInfo || !this.mainWindow) {
      return;
    }

    const recommendedUser = this.xiaoyuzhouDetector.getRecommendedUser(this.xiaoyuzhouAppInfo);
    if (!recommendedUser) {
      return;
    }

    const message: MainToRendererMessage = {
      type: 'database-connected',
      payload: { 
        path: recommendedUser.dbPath,
        autoConnected: true,
        appInfo: {
          containerId: this.xiaoyuzhouAppInfo.containerId,
          userId: recommendedUser.userId,
          audioFilePath: recommendedUser.audioFilePath
        }
      }
    };

    this.mainWindow.webContents.send('main-message', message);
  }

  private setupIPC(): void {
    // 打开数据库
    ipcMain.handle('open-database', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'open-database') {
          const { path: dbPath } = message.payload;
          
          // 尝试连接 Cosmos 数据库
          await this.cosmosDbService.connect(dbPath);
          
          const response: MainToRendererMessage = {
            type: 'database-connected',
            payload: { path: dbPath }
          };
          
          this.mainWindow?.webContents.send('main-message', response);
          
          // 获取统计信息
          const stats = await this.cosmosDbService.getStatistics();
          console.log('数据库统计:', stats);
          
          return { success: true, path: dbPath, stats };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed to open database:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取文件列表（包含完整播放列表信息）
    ipcMain.handle('get-files', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'get-files') {
          // 使用新方法获取完整的播客单集信息
          const files = await this.cosmosDbService.getPlaylistsWithFullInfo();
          
          const response: MainToRendererMessage = {
            type: 'files-found',
            payload: { files }
          };
          
          this.mainWindow?.webContents.send('main-message', response);
          return { success: true, files };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed to get files:', error);
        return { success: false, error: error.message };
      }
    });

    // 开始转换
    ipcMain.handle('start-conversion', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'start-conversion') {
          const { fileId, outputDir } = message.payload;
          
          // 获取完整的播客信息以获取标题
          const files = await this.cosmosDbService.getPlaylistsWithFullInfo();
          const file = files.find(f => f.id === fileId);
          
          if (!file) {
            return { success: false, error: '找不到指定的文件' };
          }
          
          if (!file.isDownloaded || !file.localPath) {
            return { success: false, error: '文件尚未下载' };
          }
          
          // 生成安全的文件名（使用标题）
          const safeTitle = this.sanitizeFilename(file.title || file.id);
          const outputFilename = `${safeTitle}.mp3`;
          const outputPath = path.join(outputDir, outputFilename);
          
          // 准备元数据
          const metadata = {
            title: file.title,
            artist: file.podcastAuthor || file.podcastTitle,
            album: file.podcastTitle,
            comment: file.description || '',
            coverUrl: file.image || file.podcastImage
          };
          
          // 为该任务设置独立的回调
          this.audioProcessor.setTaskCallbacks(fileId, {
            onProgress: (progress: number) => {
              const response: MainToRendererMessage = {
                type: 'task-progress',
                payload: { taskId: fileId, progress }
              };
              this.mainWindow?.webContents.send('main-message', response);
            },
            onComplete: (result: string) => {
              const response: MainToRendererMessage = {
                type: 'task-completed',
                payload: { taskId: fileId, result: outputPath }
              };
              this.mainWindow?.webContents.send('main-message', response);
            },
            onError: (error: string) => {
              const response: MainToRendererMessage = {
                type: 'task-failed',
                payload: { taskId: fileId, error }
              };
              this.mainWindow?.webContents.send('main-message', response);
            }
          });

          // 开始转换（带元数据）
          const result = await this.audioProcessor.convertFiles(
            [file.localPath], 
            outputDir, 
            this.appConfig,
            fileId,
            outputFilename,
            metadata
          );
          
          return { success: true, result, outputPath };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed to start conversion:', error);
        return { success: false, error: error.message };
      }
    });
    
    // 批量转换
    ipcMain.handle('batch-conversion', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'batch-conversion') {
          const { fileIds, outputDir } = message.payload;
          
          const files = await this.cosmosDbService.getPlaylistsWithFullInfo();
          const filesToConvert = files.filter(f => 
            fileIds.includes(f.id) && f.isDownloaded && f.localPath
          );
          
          if (filesToConvert.length === 0) {
            return { success: false, error: '没有可转换的文件' };
          }
          
          // 通知开始批量转换
          this.mainWindow?.webContents.send('main-message', {
            type: 'batch-started',
            payload: { total: filesToConvert.length }
          });
          
          // 逐个转换
          for (const file of filesToConvert) {
            const safeTitle = this.sanitizeFilename(file.title || file.id);
            const outputFilename = `${safeTitle}.mp3`;
            
            try {
              await this.audioProcessor.convertFiles(
                [file.localPath!], 
                outputDir, 
                this.appConfig,
                file.id,
                outputFilename
              );
            } catch (error: any) {
              console.error(`转换失败 ${file.title}:`, error);
            }
          }
          
          return { success: true, converted: filesToConvert.length };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed batch conversion:', error);
        return { success: false, error: error.message };
      }
    });

    // 选择文件夹
    ipcMain.handle('select-folder', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openDirectory']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }
      
      return { success: false };
    });

    // 选择数据库文件
    ipcMain.handle('select-database', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openFile'],
        filters: [
          { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }
      
      return { success: false };
    });

    // 设置配置
    ipcMain.handle('set-config', async (event, message: RendererToMainMessage) => {
      if (message.type === 'set-config') {
        this.appConfig = { ...this.appConfig, ...message.payload };
        return { success: true, config: this.appConfig };
      }
      return { success: false, error: 'Invalid message type' };
    });
  }

  /**
   * 清理文件名，移除不安全字符
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '') // 移除不安全字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .substring(0, 200); // 限制长度
  }
}

// 启动应用
new MainProcess();