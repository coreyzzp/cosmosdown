import { MainToRendererMessage, RendererToMainMessage } from '../types';

class RendererApp {
  private selectedFiles: Set<string> = new Set();
  private audioFiles: any[] = [];
  private filteredFiles: any[] = [];
  private conversionTasks: Map<string, any> = new Map();
  private isConnected = false;
  private sortBy: 'title' | 'pubDate' | 'playCount' | 'duration' = 'pubDate';
  private sortOrder: 'asc' | 'desc' = 'desc';
  private filterText = '';
  private filterDownloadStatus: 'all' | 'downloaded' | 'not-downloaded' = 'all';
  private currentDetailFile: any = null;
  private readonly MAX_CONCURRENT_CONVERSIONS = 5;
  private activeConversions: Set<string> = new Set();
  private conversionQueue: Array<{fileId: string, file: any}> = [];

  constructor() {
    this.initializeApp();
    this.setupEventListeners();
    this.setupIPCListeners();
    this.loadLastDatabase();
  }

  /**
   * 加载上次打开的数据库路径
   */
  private loadLastDatabase(): void {
    const lastDbPath = localStorage.getItem('lastDatabasePath');
    if (lastDbPath) {
      const dbPathInput = document.getElementById('dbPath') as HTMLInputElement;
      dbPathInput.value = lastDbPath;
      const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
      connectBtn.disabled = false;
      this.log(`已加载上次打开的数据库: ${lastDbPath}`, 'info');
    }
    
    // 加载上次选择的输出目录
    const lastOutputPath = localStorage.getItem('lastOutputPath');
    if (lastOutputPath) {
      const outputPathInput = document.getElementById('outputPath') as HTMLInputElement;
      outputPathInput.value = lastOutputPath;
      this.log(`已加载上次的输出目录: ${lastOutputPath}`, 'info');
    }
  }

  /**
   * 保存数据库路径到本地存储
   */
  private saveLastDatabase(dbPath: string): void {
    localStorage.setItem('lastDatabasePath', dbPath);
  }
  
  /**
   * 保存输出目录到本地存储
   */
  private saveLastOutputPath(outputPath: string): void {
    localStorage.setItem('lastOutputPath', outputPath);
  }

  private initializeApp(): void {
    this.log('应用初始化完成');
    this.updateUI();
    this.updateDownloadFilterButtons();
  }

  private setupEventListeners(): void {
    // 数据库路径输入框监听
    const dbPathInput = document.getElementById('dbPath') as HTMLInputElement;
    dbPathInput.addEventListener('input', () => {
      const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
      connectBtn.disabled = !dbPathInput.value.trim();
    });

    // 详情面板关闭按钮
    const closeDetailsBtn = document.getElementById('closeDetailsBtn') as HTMLButtonElement;
    closeDetailsBtn?.addEventListener('click', () => {
      this.hideDetailsPanel();
    });

    // 点击遮罩层关闭
    const detailsPanel = document.getElementById('detailsPanel') as HTMLDivElement;
    const detailsOverlay = detailsPanel?.querySelector('.details-overlay') as HTMLDivElement;
    detailsOverlay?.addEventListener('click', () => {
      this.hideDetailsPanel();
    });

    // 过滤输入框监听
    const filterInput = document.getElementById('filterInput') as HTMLInputElement;
    filterInput?.addEventListener('input', (e) => {
      this.filterText = (e.target as HTMLInputElement).value.trim();
      this.applyFilter();
      const clearBtn = document.getElementById('clearFilterBtn') as HTMLButtonElement;
      if (clearBtn) {
        clearBtn.disabled = !this.filterText;
      }
    });

    // 清除过滤按钮
    const clearFilterBtn = document.getElementById('clearFilterBtn') as HTMLButtonElement;
    clearFilterBtn?.addEventListener('click', () => {
      const filterInput = document.getElementById('filterInput') as HTMLInputElement;
      if (filterInput) {
        filterInput.value = '';
        this.filterText = '';
        this.applyFilter();
        clearFilterBtn.disabled = true;
      }
    });

    // 下载状态过滤
    const downloadFilterAll = document.getElementById('downloadFilterAll') as HTMLButtonElement;
    const downloadFilterDownloaded = document.getElementById('downloadFilterDownloaded') as HTMLButtonElement;
    const downloadFilterNotDownloaded = document.getElementById('downloadFilterNotDownloaded') as HTMLButtonElement;

    downloadFilterAll?.addEventListener('click', () => {
      this.filterDownloadStatus = 'all';
      this.updateDownloadFilterButtons();
      this.applyFilter();
    });

    downloadFilterDownloaded?.addEventListener('click', () => {
      this.filterDownloadStatus = 'downloaded';
      this.updateDownloadFilterButtons();
      this.applyFilter();
    });

    downloadFilterNotDownloaded?.addEventListener('click', () => {
      this.filterDownloadStatus = 'not-downloaded';
      this.updateDownloadFilterButtons();
      this.applyFilter();
    });

    // 排序按钮监听
    const sortTitleBtn = document.getElementById('sortByTitle') as HTMLButtonElement;
    const sortDateBtn = document.getElementById('sortByDate') as HTMLButtonElement;
    const sortPlayBtn = document.getElementById('sortByPlay') as HTMLButtonElement;
    const sortDurationBtn = document.getElementById('sortByDuration') as HTMLButtonElement;

    sortTitleBtn?.addEventListener('click', () => this.setSortBy('title'));
    sortDateBtn?.addEventListener('click', () => this.setSortBy('pubDate'));
    sortPlayBtn?.addEventListener('click', () => this.setSortBy('playCount'));
    sortDurationBtn?.addEventListener('click', () => this.setSortBy('duration'));

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
          this.saveLastDatabase(dbPath); // 保存数据库路径
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
        this.saveLastOutputPath(result.path); // 保存输出目录
        this.log(`已选择输出目录: ${result.path}`);
        this.updateUI();
      }
    });
    
    // 输出路径变化时自动保存
    const outputPathInput = document.getElementById('outputPath') as HTMLInputElement;
    outputPathInput.addEventListener('change', () => {
      const path = outputPathInput.value.trim();
      if (path) {
        this.saveLastOutputPath(path);
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
          if (message.payload.autoConnected) {
            this.log(`🎉 自动检测到小宇宙应用！`, 'success');
            if (message.payload.appInfo) {
              this.log(`容器ID: ${message.payload.appInfo.containerId}`, 'info');
              this.log(`用户ID: ${message.payload.appInfo.userId}`, 'info');
              this.log(`音频目录: ${message.payload.appInfo.audioFilePath}`, 'info');
            }
            this.isConnected = true;
            this.updateConnectionStatus(true, message.payload.path);
            // 自动加载文件
            setTimeout(() => this.loadFiles(), 500);
          } else {
            this.log(`数据库已连接: ${message.payload.path}`, 'success');
          }
          break;

        case 'files-found':
          this.audioFiles = message.payload.files;
          this.renderFilesList();
          this.log(`找到 ${this.audioFiles.length} 个音频文件`, 'info');
          break;

        case 'task-progress':
          this.updateConversionProgress(message.payload.taskId, message.payload.progress);
          break;

        case 'task-completed':
          this.handleConversionCompleted(message.payload.taskId, message.payload.result);
          break;

        case 'task-failed':
          this.handleConversionFailed(message.payload.taskId, message.payload.error);
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
        this.applyFilter(); // 应用过滤
        this.log(`加载了 ${this.audioFiles.length} 个音频文件`, 'info');
        
        // 启用过滤输入框和下载状态过滤按钮
        const filterInput = document.getElementById('filterInput') as HTMLInputElement;
        if (filterInput) {
          filterInput.disabled = false;
        }
        
        const downloadFilterButtons = [
          document.getElementById('downloadFilterAll'),
          document.getElementById('downloadFilterDownloaded'),
          document.getElementById('downloadFilterNotDownloaded')
        ];
        downloadFilterButtons.forEach(btn => {
          if (btn) (btn as HTMLButtonElement).disabled = false;
        });
      } else {
        throw new Error(result.error || '加载文件失败');
      }
    } catch (error: any) {
      this.log(`加载文件失败: ${error?.message || 'Unknown error'}`, 'error');
    }
  }

  /**
   * 应用过滤
   */
  private applyFilter(): void {
    let filtered = this.audioFiles;

    // 应用文本搜索过滤
    if (this.filterText) {
      const searchTerm = this.filterText.toLowerCase();
      filtered = filtered.filter(file => {
        const title = (file.title || '').toLowerCase();
        const podcastTitle = (file.podcastTitle || '').toLowerCase();
        const podcastAuthor = (file.podcastAuthor || '').toLowerCase();
        const description = (file.description || '').toLowerCase();
        
        return title.includes(searchTerm) || 
               podcastTitle.includes(searchTerm) || 
               podcastAuthor.includes(searchTerm) ||
               description.includes(searchTerm);
      });
    }

    // 应用下载状态过滤
    if (this.filterDownloadStatus === 'downloaded') {
      filtered = filtered.filter(file => file.isDownloaded === true);
    } else if (this.filterDownloadStatus === 'not-downloaded') {
      filtered = filtered.filter(file => !file.isDownloaded);
    }

    this.filteredFiles = filtered;
    this.renderFilesList();
    
    // 显示过滤统计
    const filters = [];
    if (this.filterText) filters.push(`搜索"${this.filterText}"`);
    if (this.filterDownloadStatus !== 'all') {
      filters.push(this.filterDownloadStatus === 'downloaded' ? '已下载' : '未下载');
    }
    
    if (filters.length > 0) {
      this.log(`过滤结果 (${filters.join(', ')}): ${this.filteredFiles.length} / ${this.audioFiles.length} 个文件`, 'info');
    }
  }

  /**
   * 更新下载状态过滤按钮
   */
  private updateDownloadFilterButtons(): void {
    const buttons = {
      'all': document.getElementById('downloadFilterAll'),
      'downloaded': document.getElementById('downloadFilterDownloaded'),
      'not-downloaded': document.getElementById('downloadFilterNotDownloaded')
    };

    Object.entries(buttons).forEach(([key, btn]) => {
      if (btn) {
        if (key === this.filterDownloadStatus) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  /**
   * 更新文件统计信息
   */
  private updateFileStats(): void {
    const statsBadge = document.getElementById('fileStatsBadge');
    if (!statsBadge) return;

    const totalFiles = this.audioFiles.length;
    const filteredCount = this.filteredFiles.length;
    const downloadedCount = this.filteredFiles.filter(f => f.isDownloaded).length;

    let statsText = '';
    
    if (this.filterDownloadStatus === 'all' && !this.filterText) {
      // 显示总数
      statsText = `<span class="stats-count">${totalFiles}</span> 个文件`;
    } else {
      // 显示过滤后的数量
      statsText = `<span class="stats-count">${filteredCount}</span> / ${totalFiles} 个文件`;
      
      // 显示已下载数量
      if (filteredCount > 0) {
        statsText += ` <span class="stats-separator">·</span> <span class="stats-downloaded">${downloadedCount} 已下载</span>`;
      }
    }

    statsBadge.innerHTML = statsText;
  }

  /**
   * 设置排序方式
   */
  private setSortBy(sortBy: 'title' | 'pubDate' | 'playCount' | 'duration'): void {
    if (this.sortBy === sortBy) {
      // 切换排序顺序
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = 'desc';
    }
    
    this.renderFilesList();
    this.updateSortButtons();
    this.log(`已按 ${sortBy} ${this.sortOrder === 'asc' ? '升序' : '降序'} 排序`);
  }

  /**
   * 更新排序按钮状态
   */
  private updateSortButtons(): void {
    const buttons = {
      'title': document.getElementById('sortByTitle'),
      'pubDate': document.getElementById('sortByDate'),
      'playCount': document.getElementById('sortByPlay'),
      'duration': document.getElementById('sortByDuration')
    };

    Object.entries(buttons).forEach(([key, btn]) => {
      if (btn) {
        btn.className = key === this.sortBy 
          ? `btn btn-secondary active ${this.sortOrder}`
          : 'btn btn-secondary';
      }
    });
  }

  /**
   * 排序音频文件列表
   */
  private sortAudioFiles(files: any[]): any[] {
    return [...files].sort((a, b) => {
      let aVal = a[this.sortBy];
      let bVal = b[this.sortBy];

      // 处理空值
      if (aVal === null || aVal === undefined) aVal = this.sortBy === 'title' ? '' : 0;
      if (bVal === null || bVal === undefined) bVal = this.sortBy === 'title' ? '' : 0;

      // 字符串比较
      if (typeof aVal === 'string') {
        return this.sortOrder === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }

      // 数值比较
      return this.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  /**
   * 显示详情面板
   */
  private showDetailsPanel(file: any): void {
    this.currentDetailFile = file;
    const detailsPanel = document.getElementById('detailsPanel') as HTMLDivElement;
    const detailsBody = detailsPanel.querySelector('.details-body') as HTMLDivElement;

    const pubDate = file.pubDate ? new Date(file.pubDate * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }) : '未知';
    
    const duration = file.duration ? this.formatDuration(file.duration) : '未知';
    const fileSize = file.audioSize ? this.formatFileSize(file.audioSize) : '未知';
    
    const progressInfo = file.progress > 0 
      ? `${this.formatDuration(file.progress)} (${file.progressPercent}%)`
      : '未播放';
    
    const lastPlayedInfo = file.lastPlayed 
      ? new Date(file.lastPlayed * 1000).toLocaleString('zh-CN')
      : '从未播放';

    detailsBody.innerHTML = `
      <div class="detail-section">
        <h3>📻 单集信息</h3>
        <div class="detail-row">
          <div class="detail-label">标题</div>
          <div class="detail-value">${this.escapeHtml(file.title || '未命名')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">播客</div>
          <div class="detail-value">${this.escapeHtml(file.podcastTitle || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">作者</div>
          <div class="detail-value">${this.escapeHtml(file.podcastAuthor || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">描述</div>
          <div class="detail-value">${this.escapeHtml(file.description || '无描述')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">封面</div>
          <div class="detail-value">
            ${file.image ? `<img src="${file.image}" style="max-width: 200px; border-radius: 8px; margin-top: 8px;" onerror="this.style.display='none'">` : '无'}
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>🎵 音频文件</h3>
        <div class="detail-row">
          <div class="detail-label">文件名</div>
          <div class="detail-value">${this.escapeHtml(file.audioFilename || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">URL</div>
          <div class="detail-value long-text">${this.escapeHtml(file.audioUrl || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">本地路径</div>
          <div class="detail-value long-text">${this.escapeHtml(file.localPath || '未下载')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">文件大小</div>
          <div class="detail-value">${fileSize}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">加密密钥</div>
          <div class="detail-value long-text">${this.escapeHtml(file.audioKey || '无')}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>📊 统计信息</h3>
        <div class="detail-row">
          <div class="detail-label">播放次数</div>
          <div class="detail-value">${file.playCount || 0} 次</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">评论数</div>
          <div class="detail-value">${file.commentCount || 0} 条</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">订阅数</div>
          <div class="detail-value">${file.subscriptionCount || 0} 人</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">发布日期</div>
          <div class="detail-value">${pubDate}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">时长</div>
          <div class="detail-value">${duration}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">播放进度</div>
          <div class="detail-value">${progressInfo}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">最后播放</div>
          <div class="detail-value">${lastPlayedInfo}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>✓ 状态</h3>
        <div class="detail-row">
          <div class="detail-label">收藏</div>
          <div class="detail-value">${file.isFavorited ? '❤️ 是' : '否'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">已完成</div>
          <div class="detail-value">${file.isFinished ? '✓ 是' : '否'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">已下载</div>
          <div class="detail-value">${file.isDownloaded ? '💾 是' : '否'}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>🔑 技术信息</h3>
        <div class="detail-row">
          <div class="detail-label">单集ID</div>
          <div class="detail-value">${this.escapeHtml(file.id || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">播客ID</div>
          <div class="detail-value">${this.escapeHtml(file.podcastId || '未知')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">音频EID</div>
          <div class="detail-value">${this.escapeHtml(file.audioEid || '未知')}</div>
        </div>
      </div>
    `;

    detailsPanel.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 禁止背景滚动
  }

  /**
   * 隐藏详情面板
   */
  private hideDetailsPanel(): void {
    const detailsPanel = document.getElementById('detailsPanel') as HTMLDivElement;
    detailsPanel.style.display = 'none';
    document.body.style.overflow = ''; // 恢复滚动
    this.currentDetailFile = null;
  }

  private renderFilesList(): void {
    const filesList = document.getElementById('filesList') as HTMLDivElement;
    
    // 更新文件统计
    this.updateFileStats();
    
    if (this.filteredFiles.length === 0) {
      if (this.filterText || this.filterDownloadStatus !== 'all') {
        filesList.innerHTML = '<div class="empty-state"><p>没有找到匹配的文件</p></div>';
      } else {
        filesList.innerHTML = '<div class="empty-state"><p>未找到音频文件</p></div>';
      }
      return;
    }

    // 排序文件
    const sortedFiles = this.sortAudioFiles(this.filteredFiles);

    const filesHtml = sortedFiles.map(file => {
      const pubDate = file.pubDate ? new Date(file.pubDate * 1000).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }) : '未知';
      
      const duration = file.duration ? this.formatDuration(file.duration) : '未知';
      const fileSize = file.audioSize ? this.formatFileSize(file.audioSize) : '未知';

      // 构建状态标签
      const badges = [];
      if (file.isFavorited) badges.push('<span class="badge badge-favorite">❤️ 收藏</span>');
      if (file.isFinished) badges.push('<span class="badge badge-finished">✓ 已听完</span>');
      if (file.isDownloaded) badges.push('<span class="badge badge-downloaded">💾 已下载</span>');
      if (file.progress > 0 && !file.isFinished) {
        badges.push(`<span class="badge badge-progress">▶️ ${file.progressPercent}%</span>`);
      }

      // 获取封面图URL（优先使用单集封面，否则使用播客封面）
      const coverUrl = file.image || file.podcastImage;

      return `
      <div class="file-item ${file.isDownloaded ? 'downloaded' : ''}">
        <input type="checkbox" class="file-checkbox" data-file-id="${file.id}" 
               ${this.selectedFiles.has(file.id?.toString()) ? 'checked' : ''}>
        ${coverUrl ? `
        <div class="file-cover">
          <img src="${this.escapeHtml(coverUrl)}" alt="封面" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E🎵%3C/text%3E%3C/svg%3E';">
        </div>
        ` : `
        <div class="file-cover">
          <img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E🎵%3C/text%3E%3C/svg%3E" alt="默认封面">
        </div>
        `}
        <div class="file-info">
          <div class="file-title">
            ${this.escapeHtml(file.title || '未命名单集')}
            <button class="info-btn" data-file-id="${file.id}" title="查看详细信息">ℹ</button>
            ${file.isDownloaded ? `<button class="convert-btn" data-file-id="${file.id}" title="转换为MP3">🔄 转换</button>` : ''}
          </div>
          <div class="file-meta">
            <span class="podcast-title">${this.escapeHtml(file.podcastTitle || '未知播客')}</span>
            ${file.podcastAuthor ? `<span class="podcast-author">· ${this.escapeHtml(file.podcastAuthor)}</span>` : ''}
            ${file.isDownloaded ? `<span class="local-file-info"> | 本地: ${this.escapeHtml(file.localFileFormat.toUpperCase())} ${this.formatFileSize(file.localFileSize)}</span>` : ''}
          </div>
          <div class="file-badges">
            ${badges.join(' ')}
          </div>
          <div class="file-stats">
            <span class="stat" title="发布日期">📅 ${pubDate}</span>
            <span class="stat" title="时长">⏱ ${duration}</span>
            <span class="stat" title="播放次数">▶️ ${file.playCount || 0}</span>
            <span class="stat" title="评论数">💬 ${file.commentCount || 0}</span>
            <span class="stat" title="文件大小">💾 ${fileSize}</span>
          </div>
        </div>
      </div>
    `;
    }).join('');

    filesList.innerHTML = filesHtml;

    // 设置信息按钮点击事件
    const infoButtons = filesList.querySelectorAll('.info-btn') as NodeListOf<HTMLButtonElement>;
    infoButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止触发其他事件
        const fileId = btn.dataset.fileId!;
        const file = this.filteredFiles.find(f => f.id?.toString() === fileId);
        if (file) {
          this.showDetailsPanel(file);
        }
      });
    });

    // 设置转换按钮点击事件
    const convertButtons = filesList.querySelectorAll('.convert-btn') as NodeListOf<HTMLButtonElement>;
    convertButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileId = btn.dataset.fileId!;
        this.convertFile(fileId);
      });
    });

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
    this.updateSortButtons();
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    
    // 保存输出目录
    this.saveLastOutputPath(outputPath);

    const selectedFiles = this.audioFiles.filter(file => 
      this.selectedFiles.has(file.id.toString())
    );
    
    // 检查是否有未下载的文件
    const notDownloaded = selectedFiles.filter(f => !f.isDownloaded);
    if (notDownloaded.length > 0) {
      this.log(`警告: ${notDownloaded.length} 个文件未下载，将被跳过`, 'error');
    }
    
    const downloadedFiles = selectedFiles.filter(f => f.isDownloaded);
    if (downloadedFiles.length === 0) {
      this.log('没有可转换的文件（所有选中的文件都未下载）', 'error');
      return;
    }

    try {
      this.showProgressSection(true);
      this.log(`开始批量转换 ${downloadedFiles.length} 个文件...`, 'info');
      
      // 为每个文件创建转换任务
      downloadedFiles.forEach(file => {
        this.conversionTasks.set(file.id, {
          id: file.id,
          title: file.title,
          status: 'pending',
          progress: 0
        });
      });
      this.renderConversionList();

      const message: RendererToMainMessage = {
        type: 'batch-conversion',
        payload: {
          fileIds: downloadedFiles.map(f => f.id),
          outputDir: outputPath
        }
      };

      const result = await window.electronAPI.sendMessage(message);
      if (result.success) {
        this.log(`批量转换任务已启动，共 ${result.converted} 个文件`, 'success');
      } else {
        throw new Error(result.error || '启动转换失败');
      }
    } catch (error: any) {
      this.log(`启动转换失败: ${error.message}`, 'error');
      this.showProgressSection(false);
    }
  }

  private updateConversionProgress(taskId: string, progress: number): void {
    const task = this.conversionTasks.get(taskId);
    if (task) {
      task.status = 'converting';
      task.progress = progress;
      this.renderConversionList();
    }
  }

  private handleConversionCompleted(taskId: string, result: string): void {
    const task = this.conversionTasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.progress = 100;
      this.renderConversionList();
    }
    
    // 从活动转换集合中移除
    this.activeConversions.delete(taskId);
    
    this.log(`转换完成: ${result}`, 'success');
    
    // 处理队列中的下一个任务
    const outputPath = (document.getElementById('outputPath') as HTMLInputElement).value.trim();
    this.processConversionQueue(outputPath);
  }

  private handleConversionFailed(taskId: string, error: string): void {
    const task = this.conversionTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.progress = 0;
      this.renderConversionList();
    }
    
    // 从活动转换集合中移除
    this.activeConversions.delete(taskId);
    
    this.log(`转换失败: ${error}`, 'error');
    
    // 处理队列中的下一个任务
    const outputPath = (document.getElementById('outputPath') as HTMLInputElement).value.trim();
    this.processConversionQueue(outputPath);
  }

  /**
   * 转换单个文件
   */
  private async convertFile(fileId: string): Promise<void> {
    const outputPath = (document.getElementById('outputPath') as HTMLInputElement).value.trim();
    
    if (!outputPath) {
      this.log('请先选择输出目录', 'error');
      return;
    }
    
    // 保存输出目录
    this.saveLastOutputPath(outputPath);

    const file = this.audioFiles.find(f => f.id === fileId);
    if (!file) {
      this.log('找不到指定的文件', 'error');
      return;
    }

    if (!file.isDownloaded) {
      this.log(`文件尚未下载: ${file.title}`, 'error');
      return;
    }

    // 显示转换面板
    this.showProgressSection(true);
    
    // 添加到转换列表
    this.conversionTasks.set(fileId, {
      id: fileId,
      title: file.title,
      status: 'pending',
      progress: 0
    });
    this.renderConversionList();
    
    // 检查并行转换限制
    if (this.activeConversions.size >= this.MAX_CONCURRENT_CONVERSIONS) {
      this.conversionQueue.push({ fileId, file });
      this.updateConversionTask(fileId, 'pending', 0);
      this.log(`转换任务已加入队列 (${this.conversionQueue.length} 个等待): ${file.title}`, 'info');
      return;
    }
    
    // 开始转换
    await this.startConversionTask(fileId, file, outputPath);
  }
  
  /**
   * 开始转换任务
   */
  private async startConversionTask(fileId: string, file: any, outputPath: string): Promise<void> {
    this.activeConversions.add(fileId);
    this.log(`开始转换 (${this.activeConversions.size}/${this.MAX_CONCURRENT_CONVERSIONS}): ${file.title}`, 'info');

    try {
      const message: RendererToMainMessage = {
        type: 'start-conversion',
        payload: {
          fileId,
          outputDir: outputPath
        }
      };

      const result = await window.electronAPI.sendMessage(message);
      if (result.success) {
        this.updateConversionTask(fileId, 'converting', 0);
      } else {
        throw new Error(result.error || '启动转换失败');
      }
    } catch (error: any) {
      this.log(`启动转换失败: ${error.message}`, 'error');
      this.updateConversionTask(fileId, 'failed', 0);
      this.activeConversions.delete(fileId);
      this.processConversionQueue(outputPath);
    }
  }
  
  /**
   * 处理转换队列
   */
  private processConversionQueue(outputPath: string): void {
    if (this.conversionQueue.length > 0 && this.activeConversions.size < this.MAX_CONCURRENT_CONVERSIONS) {
      const next = this.conversionQueue.shift();
      if (next) {
        this.log(`从队列中取出下一个任务: ${next.file.title}`, 'info');
        this.startConversionTask(next.fileId, next.file, outputPath);
      }
    }
  }
  
  /**
   * 删除转换任务
   */
  private removeConversionTask(taskId: string): void {
    this.conversionTasks.delete(taskId);
    this.renderConversionList();
    this.log(`已删除转换记录`, 'info');
  }

  /**
   * 更新转换任务
   */
  private updateConversionTask(taskId: string, status: string, progress: number): void {
    const task = this.conversionTasks.get(taskId);
    if (task) {
      task.status = status;
      task.progress = progress;
      this.renderConversionList();
    }
  }

  /**
   * 渲染转换列表
   */
  private renderConversionList(): void {
    const conversionList = document.getElementById('conversionList') as HTMLDivElement;
    
    if (this.conversionTasks.size === 0) {
      conversionList.innerHTML = '<div class="empty-state"><p>暂无转换任务</p></div>';
      return;
    }

    const tasksHtml = Array.from(this.conversionTasks.values()).map(task => {
      const statusText = {
        'pending': `等待中 (队列: ${this.conversionQueue.findIndex(q => q.fileId === task.id) + 1})`,
        'converting': '转换中',
        'completed': '已完成',
        'failed': '失败'
      }[task.status] || task.status;

      return `
        <div class="conversion-item ${task.status}">
          <div class="conversion-header">
            <div class="conversion-title">${this.escapeHtml(task.title)}</div>
            <div class="conversion-actions">
              <div class="conversion-status ${task.status}">${statusText}</div>
              ${task.status === 'completed' || task.status === 'failed' ? 
                `<button class="delete-task-btn" data-task-id="${task.id}" title="删除记录">🗑️</button>` : ''}
            </div>
          </div>
          ${task.status === 'converting' ? `
            <div class="conversion-progress">
              <div class="conversion-progress-bar">
                <div class="conversion-progress-fill" style="width: ${task.progress}%"></div>
              </div>
              <div class="conversion-info">${Math.round(task.progress)}% 完成</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    conversionList.innerHTML = tasksHtml;
    
    // 添加删除按钮事件监听
    const deleteButtons = conversionList.querySelectorAll('.delete-task-btn') as NodeListOf<HTMLButtonElement>;
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.taskId!;
        this.removeConversionTask(taskId);
      });
    });
    
    // 显示队列信息
    if (this.conversionQueue.length > 0 || this.activeConversions.size > 0) {
      const queueInfo = document.createElement('div');
      queueInfo.className = 'queue-info';
      queueInfo.innerHTML = `
        <span>⚡ 正在转换: ${this.activeConversions.size}/${this.MAX_CONCURRENT_CONVERSIONS}</span>
        ${this.conversionQueue.length > 0 ? `<span>📋 队列等待: ${this.conversionQueue.length}</span>` : ''}
      `;
      conversionList.insertBefore(queueInfo, conversionList.firstChild);
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