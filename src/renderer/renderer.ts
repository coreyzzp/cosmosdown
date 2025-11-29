import { MainToRendererMessage, RendererToMainMessage, AudioFileInfo, ConversionTask } from '../types';

class RendererApp {
  private selectedFiles: Set<string> = new Set();
  private audioFiles: AudioFileInfo[] = [];
  private conversionTasks: Map<string, ConversionTask> = new Map();
  private isConnected = false;

  constructor() {
    this.initializeApp();
    this.setupEventListeners();
    this.setupIPCListeners();
  }

  private initializeApp(): void {
    this.log('应用初始化完成');
    this.updateUI();
  }

  private setupEventListeners(): void {
    // 选择数据库按钮
    const selectDbBtn = document.getElementById('selectDbBtn') as HTMLButtonElement;
    selectDbBtn.addEventListener('click', async () => {
      const result = await window.electronAPI.selectDatabase();
      if (result.success && result.path) {
        const dbPathInput = document.getElementById('dbPath') as HTMLInputElement;
        dbPathInput.value = result.path;
        const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
        connectBtn.disabled = false;
        this.log(`已选择数据库: ${result.path}`);
      }
    });

    // 连接数据库按钮
    const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
    connectBtn.addEventListener('click', async () => {
      const dbPathInput = document.getElementById('dbPath') as HTMLInputElement;
      const dbPath = dbPathInput.value.trim();
      
      if (!dbPath) {
        this.log('请先选择数据库文件', 'error');
        return;
      }

      connectBtn.disabled = true;
      connectBtn.textContent = '连接中...';

      try {
        const message: RendererToMainMessage = {
          type: 'open-database',
          payload: { path: dbPath }
        };

        const result = await window.electronAPI.sendMessage(message);
        if (result.success) {
          this.isConnected = true;
          this.updateConnectionStatus(true, dbPath);
          this.log(`数据库连接成功: ${dbPath}`, 'success');
          await this.loadFiles();
        } else {
          throw new Error(result.error || '连接失败');
        }
      } catch (error: any) {
        this.log(`数据库连接失败: ${error.message}`, 'error');
        this.updateConnectionStatus(false);
      } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
      }
    });

    // 选择输出目录按钮
    const selectOutputBtn = document.getElementById('selectOutputBtn') as HTMLButtonElement;
    selectOutputBtn.addEventListener('click', async () => {
      const result = await window.electronAPI.selectFolder();
      if (result.success && result.path) {
        const outputPathInput = document.getElementById('outputPath') as HTMLInputElement;
        outputPathInput.value = result.path;
        this.log(`已选择输出目录: ${result.path}`);
        this.updateUI();
      }
    });

    // 刷新文件列表按钮
    const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
    refreshBtn.addEventListener('click', () => {
      this.loadFiles();
    });

    // 全选按钮
    const selectAllBtn = document.getElementById('selectAllBtn') as HTMLButtonElement;
    selectAllBtn.addEventListener('click', () => {
      this.selectAllFiles(true);
    });

    // 取消全选按钮
    const deselectAllBtn = document.getElementById('deselectAllBtn') as HTMLButtonElement;
    deselectAllBtn.addEventListener('click', () => {
      this.selectAllFiles(false);
    });

    // 开始转换按钮
    const startConversionBtn = document.getElementById('startConversionBtn') as HTMLButtonElement;
    startConversionBtn.addEventListener('click', () => {
      this.startConversion();
    });

    // 清空日志按钮
    const clearLogBtn = document.getElementById('clearLogBtn') as HTMLButtonElement;
    clearLogBtn.addEventListener('click', () => {
      this.clearLog();
    });

    // 音频质量选择
    const audioQuality = document.getElementById('audioQuality') as HTMLSelectElement;
    audioQuality.addEventListener('change', () => {
      this.updateConfig();
    });
  }

  private setupIPCListeners(): void {
    window.electronAPI.onMessage((message: MainToRendererMessage) => {
      switch (message.type) {
        case 'database-connected':
          this.log(`数据库已连接: ${message.payload.path}`, 'success');
          break;

        case 'files-found':
          this.audioFiles = message.payload.files;
          this.renderFilesList();
          this.log(`找到 ${this.audioFiles.length} 个音频文件`, 'info');
          break;

        case 'task-progress':
          this.updateTaskProgress(message.payload.taskId, message.payload.progress);
          break;

        case 'task-completed':
          this.handleTaskCompleted(message.payload.taskId, message.payload.result);
          break;

        case 'task-failed':
          this.handleTaskFailed(message.payload.taskId, message.payload.error);
          break;
      }
    });
  }

  private async loadFiles(): Promise<void> {
    if (!this.isConnected) {
      this.log('请先连接数据库', 'error');
      return;
    }

    try {
      const message: RendererToMainMessage = {
        type: 'get-files',
        payload: {}
      };

      const result = await window.electronAPI.sendMessage(message);
      if (result.success) {
        this.audioFiles = result.files;
        this.renderFilesList();
        this.log(`加载了 ${this.audioFiles.length} 个音频文件`, 'info');
      } else {
        throw new Error(result.error || '加载文件失败');
      }
    } catch (error: any) {
      this.log(`加载文件失败: ${error?.message || 'Unknown error'}`, 'error');
    }
  }

  private renderFilesList(): void {
    const filesList = document.getElementById('filesList') as HTMLDivElement;
    
    if (this.audioFiles.length === 0) {
      filesList.innerHTML = '<div class="empty-state"><p>未找到音频文件</p></div>';
      return;
    }

    const filesHtml = this.audioFiles.map(file => `
      <div class="file-item">
        <input type="checkbox" class="file-checkbox" data-file-id="${file.id}" 
               ${this.selectedFiles.has(file.id.toString()) ? 'checked' : ''}>
        <div class="file-info">
          <div class="file-name">${file.fileName}</div>
          <div class="file-details">
            路径: ${file.originalPath} | 
            大小: ${this.formatFileSize(file.fileSize)} |
            时长: ${file.duration ? this.formatDuration(file.duration) : '未知'}
          </div>
        </div>
        <div class="file-status pending" id="status-${file.id}">待处理</div>
      </div>
    `).join('');

    filesList.innerHTML = filesHtml;

    // 添加复选框事件监听器
    const checkboxes = filesList.querySelectorAll('.file-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const fileId = target.dataset.fileId!;
        
        if (target.checked) {
          this.selectedFiles.add(fileId);
        } else {
          this.selectedFiles.delete(fileId);
        }
        
        this.updateUI();
      });
    });

    this.updateUI();
  }

  private selectAllFiles(select: boolean): void {
    this.selectedFiles.clear();
    
    if (select) {
      this.audioFiles.forEach(file => {
        this.selectedFiles.add(file.id.toString());
      });
    }

    // 更新复选框状态
    const checkboxes = document.querySelectorAll('.file-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.checked = select;
    });

    this.updateUI();
    this.log(select ? `已选择所有 ${this.selectedFiles.size} 个文件` : '已取消选择所有文件');
  }

  private async startConversion(): Promise<void> {
    const outputPath = (document.getElementById('outputPath') as HTMLInputElement).value.trim();
    
    if (!outputPath) {
      this.log('请选择输出目录', 'error');
      return;
    }

    if (this.selectedFiles.size === 0) {
      this.log('请选择要转换的文件', 'error');
      return;
    }

    const selectedFilePaths = this.audioFiles
      .filter(file => this.selectedFiles.has(file.id.toString()))
      .map(file => file.originalPath);

    try {
      this.showProgressSection(true);
      this.log(`开始转换 ${selectedFilePaths.length} 个文件...`, 'info');

      const message: RendererToMainMessage = {
        type: 'start-conversion',
        payload: {
          files: selectedFilePaths,
          outputDir: outputPath
        }
      };

      const result = await window.electronAPI.sendMessage(message);
      if (result.success) {
        this.log('转换任务已启动', 'success');
      } else {
        throw new Error(result.error || '启动转换失败');
      }
    } catch (error: any) {
      this.log(`启动转换失败: ${error.message}`, 'error');
      this.showProgressSection(false);
    }
  }

  private updateTaskProgress(taskId: string, progress: number): void {
    // 更新单个任务进度
    let progressElement = document.getElementById(`progress-${taskId}`);
    if (!progressElement) {
      const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
      progressElement = document.createElement('div');
      progressElement.className = 'task-progress';
      progressElement.id = `progress-${taskId}`;
      progressElement.innerHTML = `
        <div class="task-name">${taskId}</div>
        <div class="progress-bar">
          <div class="progress-fill" id="fill-${taskId}"></div>
        </div>
        <div class="task-progress-text" id="text-${taskId}">0%</div>
      `;
      progressContainer.appendChild(progressElement);
    }

    const fillElement = document.getElementById(`fill-${taskId}`) as HTMLDivElement;
    const textElement = document.getElementById(`text-${taskId}`) as HTMLDivElement;
    
    fillElement.style.width = `${progress}%`;
    textElement.textContent = `${Math.round(progress)}%`;

    // 更新总体进度
    this.updateOverallProgress();
  }

  private updateOverallProgress(): void {
    const progressElements = document.querySelectorAll('[id^="fill-"]');
    let totalProgress = 0;
    let completedTasks = 0;

    progressElements.forEach(element => {
      const width = parseFloat((element as HTMLDivElement).style.width) || 0;
      totalProgress += width;
      if (width >= 100) completedTasks++;
    });

    const averageProgress = progressElements.length > 0 ? totalProgress / progressElements.length : 0;
    
    const overallFill = document.getElementById('overallProgress') as HTMLDivElement;
    const overallText = document.getElementById('overallProgressText') as HTMLSpanElement;
    
    overallFill.style.width = `${averageProgress}%`;
    overallText.textContent = `${Math.round(averageProgress)}%`;

    if (averageProgress >= 100) {
      this.log(`所有转换任务已完成！`, 'success');
      setTimeout(() => {
        this.showProgressSection(false);
      }, 2000);
    }
  }

  private handleTaskCompleted(taskId: string, result: string): void {
    this.log(`任务完成: ${taskId} -> ${result}`, 'success');
    
    // 更新文件状态
    const statusElement = document.getElementById(`status-${taskId}`);
    if (statusElement) {
      statusElement.className = 'file-status completed';
      statusElement.textContent = '已完成';
    }
  }

  private handleTaskFailed(taskId: string, error: string): void {
    this.log(`任务失败: ${taskId} - ${error}`, 'error');
    
    // 更新文件状态
    const statusElement = document.getElementById(`status-${taskId}`);
    if (statusElement) {
      statusElement.className = 'file-status failed';
      statusElement.textContent = '失败';
    }
  }

  private showProgressSection(show: boolean): void {
    const progressSection = document.querySelector('.progress-section') as HTMLElement;
    progressSection.style.display = show ? 'block' : 'none';
    
    if (!show) {
      // 清空进度容器
      const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
      progressContainer.innerHTML = '';
      
      // 重置总体进度
      const overallFill = document.getElementById('overallProgress') as HTMLDivElement;
      const overallText = document.getElementById('overallProgressText') as HTMLSpanElement;
      overallFill.style.width = '0%';
      overallText.textContent = '0%';
    }
  }

  private updateConnectionStatus(connected: boolean, path?: string): void {
    const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
    const statusText = document.querySelector('.status-text') as HTMLSpanElement;
    
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = `已连接: ${path}`;
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = '未连接';
    }
    
    this.updateUI();
  }

  private updateUI(): void {
    const outputPath = (document.getElementById('outputPath') as HTMLInputElement).value.trim();
    const hasSelectedFiles = this.selectedFiles.size > 0;
    
    // 更新按钮状态
    (document.getElementById('refreshBtn') as HTMLButtonElement).disabled = !this.isConnected;
    (document.getElementById('selectAllBtn') as HTMLButtonElement).disabled = !this.isConnected || this.audioFiles.length === 0;
    (document.getElementById('deselectAllBtn') as HTMLButtonElement).disabled = !this.isConnected || this.audioFiles.length === 0;
    (document.getElementById('startConversionBtn') as HTMLButtonElement).disabled = 
      !this.isConnected || !hasSelectedFiles || !outputPath;
  }

  private async updateConfig(): Promise<void> {
    const audioQuality = (document.getElementById('audioQuality') as HTMLSelectElement).value as 'low' | 'medium' | 'high';
    
    const message: RendererToMainMessage = {
      type: 'set-config',
      payload: {
        database: { path: '', readonly: true },
        outputDirectory: '',
        audioQuality,
        maxConcurrentTasks: 3
      }
    };

    try {
      await window.electronAPI.sendMessage(message);
      this.log(`音频质量已设置为: ${audioQuality}`, 'info');
    } catch (error: any) {
      this.log(`设置配置失败: ${error.message}`, 'error');
    }
  }

  private log(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const logContainer = document.getElementById('logContainer') as HTMLDivElement;
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-message">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  private clearLog(): void {
    const logContainer = document.getElementById('logContainer') as HTMLDivElement;
    logContainer.innerHTML = '';
    this.log('日志已清空');
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new RendererApp();
});