/**
 * RendererApp：应用根控制器。
 *
 * 职责：持有单集列表 / 选择 / 过滤 / 排序 / 转换任务状态；调用 Rust commands；
 * 消费 `app-message` 事件驱动任务状态机（pending → converting → completed | failed）。
 *
 * 副作用清单：
 * - invoke：open_database / get_files / start_conversion / batch_conversion /
 *   set_config / detect_xiaoyuzhou / select_folder / select_database
 * - 监听：window keydown（Esc 关闭详情弹层）；filesList / conversionList 的事件委托
 * - localStorage：lastDatabasePath / lastOutputPath
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  BatchConversionResult,
  EpisodeInfo,
  MainToRendererMessage,
  XiaoyuzhouAppInfo,
} from './types';
import type { ConversionTask } from './ui';
import { renderDetails, renderEmptyState, renderEpisodeRow, renderTaskRow } from './ui';

type SortKey = 'title' | 'pubDate' | 'playCount' | 'duration';
type DownloadFilter = 'all' | 'downloaded' | 'not-downloaded';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

class RendererApp {
  private audioFiles: EpisodeInfo[] = [];
  private filteredFiles: EpisodeInfo[] = [];
  private selectedFiles = new Set<string>();
  private conversionTasks = new Map<string, ConversionTask>();
  private sortBy: SortKey = 'pubDate';
  private sortOrder: 'asc' | 'desc' = 'desc';
  private filterText = '';
  private filterDownloadStatus: DownloadFilter = 'all';
  private isConnected = false;
  private isConverting = false;

  constructor() {
    this.bindStaticListeners();
    this.bindListDelegation();
    void this.setupAppMessageListener();
    this.loadLastPaths();
    this.log('应用就绪');
    void this.autoDetectXiaoyuzhou();
  }

  // ---------------------------------------------------------------- 事件绑定

  private bindStaticListeners(): void {
    $('dbPath').addEventListener('input', () => {
      const value = ($('dbPath') as HTMLInputElement).value.trim();
      ($('connectBtn') as HTMLButtonElement).disabled = !value;
    });

    $('selectDbBtn').addEventListener('click', async () => {
      try {
        const result = await invoke<string | null>('select_database');
        if (result) {
          ($('dbPath') as HTMLInputElement).value = result;
          ($('connectBtn') as HTMLButtonElement).disabled = false;
          this.log(`已选择数据库: ${result}`);
        }
      } catch (error) {
        this.log(`选择数据库失败: ${error}`, 'error');
      }
    });

    $('connectBtn').addEventListener('click', async () => {
      const dbPath = ($('dbPath') as HTMLInputElement).value.trim();
      if (!dbPath) {
        this.log('请先选择数据库文件', 'error');
        return;
      }

      const btn = $('connectBtn') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '连接中…';
      try {
        const stats = await invoke<{ playlistCount: number }>('open_database', { path: dbPath });
        this.isConnected = true;
        this.updateConnectionStatus(true, dbPath);
        this.saveLastDatabase(dbPath);
        this.log(`数据库连接成功，共 ${stats.playlistCount} 个单集`, 'success');
        await this.loadFiles();
      } catch (error) {
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.log(`数据库连接失败: ${error}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '连接';
        this.updateUI();
      }
    });

    $('selectOutputBtn').addEventListener('click', async () => {
      try {
        const result = await invoke<string | null>('select_folder');
        if (result) {
          ($('outputPath') as HTMLInputElement).value = result;
          this.saveLastOutputPath(result);
          this.log(`已选择输出目录: ${result}`);
          this.updateUI();
        }
      } catch (error) {
        this.log(`选择目录失败: ${error}`, 'error');
      }
    });

    $('outputPath').addEventListener('change', () => {
      const path = ($('outputPath') as HTMLInputElement).value.trim();
      if (path) this.saveLastOutputPath(path);
    });

    $('audioQuality').addEventListener('change', () => this.updateConfig());

    $('filterInput').addEventListener('input', (e) => {
      this.filterText = (e.target as HTMLInputElement).value.trim();
      this.applyFilter();
    });

    const downloadFilters: Array<[string, DownloadFilter]> = [
      ['downloadFilterAll', 'all'],
      ['downloadFilterDownloaded', 'downloaded'],
      ['downloadFilterNotDownloaded', 'not-downloaded'],
    ];
    for (const [id, value] of downloadFilters) {
      $(id).addEventListener('click', () => {
        this.filterDownloadStatus = value;
        this.updateDownloadFilterButtons();
        this.applyFilter();
      });
    }

    const sortButtons: Array<[string, SortKey]> = [
      ['sortByTitle', 'title'],
      ['sortByDate', 'pubDate'],
      ['sortByPlay', 'playCount'],
      ['sortByDuration', 'duration'],
    ];
    for (const [id, key] of sortButtons) {
      $(id).addEventListener('click', () => this.setSortBy(key));
    }

    $('refreshBtn').addEventListener('click', () => void this.loadFiles());
    $('selectAllBtn').addEventListener('click', () => this.selectAllFiles(true));
    $('deselectAllBtn').addEventListener('click', () => this.selectAllFiles(false));
    $('startConversionBtn').addEventListener('click', () => void this.startConversion());
    $('clearFinishedBtn').addEventListener('click', () => this.clearFinishedTasks());
    $('clearLogBtn').addEventListener('click', () => this.clearLog());

    $('closeDetailsBtn').addEventListener('click', () => this.hideDetailsPanel());
    $('detailsPanel').querySelector('.modal-overlay')?.addEventListener('click', () => {
      this.hideDetailsPanel();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideDetailsPanel();
    });
  }

  /** 列表内元素使用事件委托，避免每次重渲染对上千行逐个 addEventListener。 */
  private bindListDelegation(): void {
    $('filesList').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const infoBtn = target.closest<HTMLElement>('[data-info-id]');
      if (infoBtn) {
        const file = this.filteredFiles.find((f) => f.id === infoBtn.dataset.infoId);
        if (file) this.showDetailsPanel(file);
        return;
      }
      const convertBtn = target.closest<HTMLElement>('[data-convert-id]');
      if (convertBtn) void this.convertFile(convertBtn.dataset.convertId!);
    });

    $('filesList').addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (!target.classList.contains('episode-check')) return;
      const fileId = target.dataset.fileId!;
      if (target.checked) this.selectedFiles.add(fileId);
      else this.selectedFiles.delete(fileId);
      this.updateUI();
    });

    $('conversionList').addEventListener('click', (e) => {
      const removeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-task-id]');
      if (removeBtn) this.removeTask(removeBtn.dataset.taskId!);
    });
  }

  // ---------------------------------------------------------------- 后端事件

  private async setupAppMessageListener(): Promise<void> {
    await listen<MainToRendererMessage>('app-message', (event) => {
      this.handleAppMessage(event.payload);
    });
  }

  private handleAppMessage(msg: MainToRendererMessage): void {
    switch (msg.type) {
      case 'database-connected':
        if (!this.isConnected) {
          this.isConnected = true;
          this.updateConnectionStatus(true, msg.path);
        }
        return;
      case 'batch-started':
        this.showProgressSection(true);
        return;
      case 'task-started':
        this.updateTask(msg.taskId, { status: 'converting', title: msg.title });
        return;
      case 'task-completed':
        this.updateTask(msg.taskId, { status: 'completed', outputPath: msg.outputPath });
        this.log(`转换完成: ${msg.outputPath}`, 'success');
        return;
      case 'task-failed':
        this.updateTask(msg.taskId, { status: 'failed', error: msg.error });
        this.log(`转换失败: ${msg.error}`, 'error');
        return;
    }
  }

  // ---------------------------------------------------------------- 数据加载

  private async autoDetectXiaoyuzhou(): Promise<void> {
    try {
      const appInfo = await invoke<XiaoyuzhouAppInfo | null>('detect_xiaoyuzhou');
      if (appInfo && appInfo.users.length > 0) {
        const user = appInfo.users[0];
        this.isConnected = true;
        ($('dbPath') as HTMLInputElement).value = user.dbPath;
        this.updateConnectionStatus(true, user.dbPath);
        this.log('检测到小宇宙应用，已自动连接数据库', 'success');
        await this.loadFiles();
      }
    } catch (error) {
      console.log('自动检测小宇宙失败:', error);
    }
  }

  private loadLastPaths(): void {
    const lastDbPath = localStorage.getItem('lastDatabasePath');
    if (lastDbPath) {
      ($('dbPath') as HTMLInputElement).value = lastDbPath;
      ($('connectBtn') as HTMLButtonElement).disabled = false;
      this.log(`已载入上次的数据库路径: ${lastDbPath}`);
    }
    const lastOutputPath = localStorage.getItem('lastOutputPath');
    if (lastOutputPath) {
      ($('outputPath') as HTMLInputElement).value = lastOutputPath;
    }
  }

  private saveLastDatabase(dbPath: string): void {
    localStorage.setItem('lastDatabasePath', dbPath);
  }

  private saveLastOutputPath(outputPath: string): void {
    localStorage.setItem('lastOutputPath', outputPath);
  }

  private async loadFiles(): Promise<void> {
    if (!this.isConnected) {
      this.log('请先连接数据库', 'error');
      return;
    }
    try {
      const files = await invoke<EpisodeInfo[]>('get_files');
      this.audioFiles = files;
      this.applyFilter();
      this.log(`已加载 ${this.audioFiles.length} 个单集`, 'success');
      this.setListControlsEnabled(true);
    } catch (error) {
      this.log(`加载文件失败: ${error}`, 'error');
    }
  }

  private setListControlsEnabled(enabled: boolean): void {
    ($('filterInput') as HTMLInputElement).disabled = !enabled;
    for (const id of [
      'downloadFilterAll',
      'downloadFilterDownloaded',
      'downloadFilterNotDownloaded',
    ]) {
      ($(id) as HTMLButtonElement).disabled = !enabled;
    }
  }

  // ---------------------------------------------------------------- 过滤 / 排序

  private applyFilter(): void {
    let filtered = this.audioFiles;

    if (this.filterText) {
      const term = this.filterText.toLowerCase();
      filtered = filtered.filter((file) => {
        const haystack = [
          file.title,
          file.podcastTitle,
          file.podcastAuthor,
          file.description,
        ]
          .map((s) => (s || '').toLowerCase())
          .join('\n');
        return haystack.includes(term);
      });
    }

    if (this.filterDownloadStatus === 'downloaded') {
      filtered = filtered.filter((f) => f.isDownloaded);
    } else if (this.filterDownloadStatus === 'not-downloaded') {
      filtered = filtered.filter((f) => !f.isDownloaded);
    }

    this.filteredFiles = filtered;
    this.renderFilesList();
  }

  private updateDownloadFilterButtons(): void {
    const map: Record<string, string> = {
      all: 'downloadFilterAll',
      downloaded: 'downloadFilterDownloaded',
      'not-downloaded': 'downloadFilterNotDownloaded',
    };
    for (const [key, id] of Object.entries(map)) {
      $(id).classList.toggle('active', key === this.filterDownloadStatus);
    }
  }

  private setSortBy(sortBy: SortKey): void {
    if (this.sortBy === sortBy) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = 'desc';
    }
    this.renderFilesList();
    this.log(`已按 ${sortBy} ${this.sortOrder === 'asc' ? '升序' : '降序'} 排序`);
  }

  private updateSortButtons(): void {
    const map: Record<SortKey, string> = {
      title: 'sortByTitle',
      pubDate: 'sortByDate',
      playCount: 'sortByPlay',
      duration: 'sortByDuration',
    };
    for (const [key, id] of Object.entries(map)) {
      const btn = $(id);
      btn.className = 'sort-btn';
      if (key === this.sortBy) {
        btn.classList.add('active', this.sortOrder);
      }
    }
  }

  private sortAudioFiles(files: EpisodeInfo[]): EpisodeInfo[] {
    return [...files].sort((a, b) => {
      const aVal = a[this.sortBy];
      const bVal = b[this.sortBy];
      const aSafe = aVal == null ? (this.sortBy === 'title' ? '' : 0) : aVal;
      const bSafe = bVal == null ? (this.sortBy === 'title' ? '' : 0) : bVal;
      if (typeof aSafe === 'string' || typeof bSafe === 'string') {
        const cmp = String(aSafe).localeCompare(String(bSafe));
        return this.sortOrder === 'asc' ? cmp : -cmp;
      }
      return this.sortOrder === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
  }

  // ---------------------------------------------------------------- 渲染

  private renderFilesList(): void {
    this.updateFileStats();
    this.updateSortButtons();

    const filesList = $('filesList');
    if (this.filteredFiles.length === 0) {
      filesList.innerHTML = renderEmptyState(
        this.filterText.length > 0 || this.filterDownloadStatus !== 'all'
      );
      this.updateUI();
      return;
    }

    const html = this.sortAudioFiles(this.filteredFiles)
      .map((file) => renderEpisodeRow(file, this.selectedFiles.has(file.id)))
      .join('');
    filesList.innerHTML = html;
    this.updateUI();
  }

  private updateFileStats(): void {
    const total = this.audioFiles.length;
    const shown = this.filteredFiles.length;
    const downloaded = this.filteredFiles.filter((f) => f.isDownloaded).length;
    const badge = $('fileStatsBadge');

    if (this.filterDownloadStatus === 'all' && !this.filterText) {
      badge.innerHTML = `<span class="meta-count">${total}</span> 个单集`;
    } else if (shown > 0) {
      badge.innerHTML = `<span class="meta-count">${shown}</span> / ${total} 个单集 · ${downloaded} 已下载`;
    } else {
      badge.innerHTML = `<span class="meta-count">0</span> / ${total} 个单集`;
    }
  }

  private selectAllFiles(select: boolean): void {
    this.selectedFiles.clear();
    if (select) {
      // 全选作用于当前过滤后的可见列表，符合直觉
      this.filteredFiles.forEach((f) => this.selectedFiles.add(f.id));
    }
    this.renderFilesList();
    this.log(select ? `已选择 ${this.selectedFiles.size} 个单集` : '已取消选择');
  }

  // ---------------------------------------------------------------- 转换流程

  private async startConversion(): Promise<void> {
    if (this.isConverting) return;

    const outputPath = ($('outputPath') as HTMLInputElement).value.trim();
    if (!outputPath) {
      this.log('请选择输出目录', 'error');
      return;
    }
    if (this.selectedFiles.size === 0) {
      this.log('请选择要转换的单集', 'error');
      return;
    }

    const selected = this.audioFiles.filter((f) => this.selectedFiles.has(f.id));
    const notDownloaded = selected.filter((f) => !f.isDownloaded);
    if (notDownloaded.length > 0) {
      this.log(`跳过 ${notDownloaded.length} 个未下载的单集`, 'error');
    }
    const downloadable = selected.filter((f) => f.isDownloaded);
    if (downloadable.length === 0) {
      this.log('选中的单集均未下载，没有可转换的文件', 'error');
      return;
    }

    this.saveLastOutputPath(outputPath);
    this.isConverting = true;
    this.updateUI();

    for (const file of downloadable) {
      this.ensureTask(file.id, file.title);
    }
    this.renderConversionList();
    this.showProgressSection(true);
    this.log(`开始批量转换 ${downloadable.length} 个单集…`);

    try {
      const results = await invoke<BatchConversionResult[]>('batch_conversion', {
        fileIds: downloadable.map((f) => f.id),
        outputDir: outputPath,
      });
      // 对账兜底：事件驱动是主路径，这里确保所有任务都有终态
      let success = 0;
      let failed = 0;
      for (const result of results) {
        if (result.success) {
          success++;
          this.updateTask(result.fileId, {
            status: 'completed',
            outputPath: result.outputPath ?? undefined,
          });
        } else {
          failed++;
          this.updateTask(result.fileId, { status: 'failed', error: result.error ?? '未知错误' });
        }
      }
      this.log(
        `批量转换结束: 成功 ${success} · 失败 ${failed}`,
        failed === 0 ? 'success' : 'info'
      );
    } catch (error) {
      this.log(`批量转换中断: ${error}`, 'error');
      for (const file of downloadable) {
        this.updateTask(file.id, { status: 'failed', error: String(error) });
      }
    } finally {
      this.isConverting = false;
      this.selectedFiles.clear();
      this.renderFilesList();
      this.updateUI();
    }
  }

  private async convertFile(fileId: string): Promise<void> {
    const outputPath = ($('outputPath') as HTMLInputElement).value.trim();
    if (!outputPath) {
      this.log('请先选择输出目录', 'error');
      return;
    }
    if (this.isConverting) {
      this.log('批量转换进行中，请稍候', 'error');
      return;
    }

    const file = this.audioFiles.find((f) => f.id === fileId);
    if (!file) {
      this.log('找不到指定的单集', 'error');
      return;
    }
    if (!file.isDownloaded) {
      this.log(`单集尚未下载: ${file.title ?? fileId}`, 'error');
      return;
    }

    this.saveLastOutputPath(outputPath);
    this.ensureTask(fileId, file.title);
    this.updateTask(fileId, { status: 'converting' });
    this.showProgressSection(true);
    this.log(`开始转换: ${file.title ?? fileId}`);

    try {
      const result = await invoke<string>('start_conversion', {
        fileId,
        outputDir: outputPath,
      });
      this.updateTask(fileId, { status: 'completed', outputPath: result });
    } catch (error) {
      this.updateTask(fileId, { status: 'failed', error: String(error) });
      this.log(`转换失败: ${error}`, 'error');
    }
  }

  private ensureTask(taskId: string, title: string | null): void {
    if (!this.conversionTasks.has(taskId)) {
      this.conversionTasks.set(taskId, { id: taskId, title: title ?? taskId, status: 'pending' });
    }
  }

  private updateTask(taskId: string, patch: Partial<ConversionTask>): void {
    const task = this.conversionTasks.get(taskId);
    if (!task) return;
    Object.assign(task, patch);
    this.renderConversionList();
  }

  private removeTask(taskId: string): void {
    this.conversionTasks.delete(taskId);
    this.renderConversionList();
    this.showProgressSection(this.conversionTasks.size > 0);
  }

  private clearFinishedTasks(): void {
    for (const [id, task] of this.conversionTasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.conversionTasks.delete(id);
      }
    }
    this.renderConversionList();
    this.showProgressSection(this.conversionTasks.size > 0);
  }

  private renderConversionList(): void {
    const list = $('conversionList');
    if (this.conversionTasks.size === 0) {
      list.innerHTML = '<div class="empty-state"><p>暂无转换任务</p></div>';
      return;
    }
    list.innerHTML = [...this.conversionTasks.values()].map(renderTaskRow).join('');
  }

  private showProgressSection(show: boolean): void {
    $('progressSection').style.display = show ? '' : 'none';
  }

  // ---------------------------------------------------------------- 详情弹层

  private showDetailsPanel(file: EpisodeInfo): void {
    const panel = $('detailsPanel');
    panel.querySelector('.details-body')!.innerHTML = renderDetails(file);
    panel.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  private hideDetailsPanel(): void {
    const panel = $('detailsPanel');
    if (panel.style.display === 'none') return;
    panel.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------------------- 状态 / 杂项

  private updateConnectionStatus(connected: boolean, path?: string): void {
    const pill = $('connPill');
    const text = $('connText');
    pill.classList.toggle('connected', connected);
    pill.title = path ?? '';
    text.textContent = connected ? (path ? `已连接 · ${path}` : '已连接') : '未连接';
    this.updateUI();
  }

  private updateUI(): void {
    const outputPath = ($('outputPath') as HTMLInputElement).value.trim();
    const hasFiles = this.filteredFiles.length > 0;

    ($('refreshBtn') as HTMLButtonElement).disabled = !this.isConnected;
    ($('selectAllBtn') as HTMLButtonElement).disabled = !this.isConnected || !hasFiles;
    ($('deselectAllBtn') as HTMLButtonElement).disabled = !this.isConnected || !hasFiles;

    const startBtn = $('startConversionBtn') as HTMLButtonElement;
    startBtn.disabled =
      !this.isConnected || this.selectedFiles.size === 0 || !outputPath || this.isConverting;
    const label = startBtn.querySelector('span');
    if (label) label.textContent = this.isConverting ? '转换中…' : '开始转换';

    const selected = this.audioFiles.filter((f) => this.selectedFiles.has(f.id));
    const downloadable = selected.filter((f) => f.isDownloaded).length;
    $('selectionHint').textContent =
      selected.length > 0 ? `已选 ${selected.length} 个（${downloadable} 个已下载可转换）` : '';
  }

  private async updateConfig(): Promise<void> {
    const audioQuality = ($('audioQuality') as HTMLSelectElement).value;
    try {
      await invoke('set_config', { audioQuality, maxConcurrentTasks: 3 });
      this.log(`音质已设置为 ${audioQuality}`);
    } catch (error) {
      this.log(`设置配置失败: ${error}`, 'error');
    }
  }

  private log(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const container = $('logContainer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]`;

    const msg = document.createElement('span');
    msg.className = 'log-message';
    msg.textContent = message;

    entry.append(time, msg);
    container.appendChild(entry);
    // 上限保护，避免长会话下日志节点无限增长
    while (container.children.length > 500) {
      container.firstElementChild?.remove();
    }
    container.scrollTop = container.scrollHeight;
  }

  private clearLog(): void {
    $('logContainer').innerHTML = '';
    this.log('日志已清空');
  }
}

new RendererApp();
