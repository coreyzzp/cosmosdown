import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DatabaseService } from './services/DatabaseService';
import { AudioProcessor } from './services/AudioProcessor';
import { RendererToMainMessage, MainToRendererMessage, AppConfig } from '../types';

class MainProcess {
  private mainWindow: BrowserWindow | null = null;
  private databaseService: DatabaseService;
  private audioProcessor: AudioProcessor;
  private appConfig: AppConfig = {
    database: { path: '', readonly: true },
    outputDirectory: '',
    audioQuality: 'medium',
    maxConcurrentTasks: 3
  };

  constructor() {
    this.databaseService = new DatabaseService();
    this.audioProcessor = new AudioProcessor();
    this.setupApp();
    this.setupIPC();
  }

  private setupApp(): void {
    app.whenReady().then(() => {
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
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });
  }

  private setupIPC(): void {
    // 打开数据库
    ipcMain.handle('open-database', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'open-database') {
          const { path: dbPath } = message.payload;
          await this.databaseService.connect(dbPath);
          
          const response: MainToRendererMessage = {
            type: 'database-connected',
            payload: { path: dbPath }
          };
          
          this.mainWindow?.webContents.send('main-message', response);
          return { success: true, path: dbPath };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed to open database:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取文件列表
    ipcMain.handle('get-files', async (event, message: RendererToMainMessage) => {
      try {
        if (message.type === 'get-files') {
          const files = await this.databaseService.getAudioFiles();
          
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
          const { files, outputDir } = message.payload;
          
          // 设置进度回调
          this.audioProcessor.onProgress = (taskId: string, progress: number) => {
            const response: MainToRendererMessage = {
              type: 'task-progress',
              payload: { taskId, progress }
            };
            this.mainWindow?.webContents.send('main-message', response);
          };

          // 设置完成回调
          this.audioProcessor.onComplete = (taskId: string, result: string) => {
            const response: MainToRendererMessage = {
              type: 'task-completed',
              payload: { taskId, result }
            };
            this.mainWindow?.webContents.send('main-message', response);
          };

          // 设置错误回调
          this.audioProcessor.onError = (taskId: string, error: string) => {
            const response: MainToRendererMessage = {
              type: 'task-failed',
              payload: { taskId, error }
            };
            this.mainWindow?.webContents.send('main-message', response);
          };

          const results = await this.audioProcessor.convertFiles(files, outputDir, this.appConfig);
          return { success: true, results };
        }
        return { success: false, error: 'Invalid message type' };
      } catch (error: any) {
        console.error('Failed to start conversion:', error);
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
}

// 启动应用
new MainProcess();