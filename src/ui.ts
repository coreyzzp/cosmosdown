/**
 * 纯模板渲染函数：只做「数据 → HTML 字符串」，不持有状态、不绑定事件。
 * 事件绑定统一收敛在 main.ts 的事件委托中。
 * 所有动态内容必须经过 escapeHtml / escapeAttr 转义。
 */
import type { EpisodeInfo } from './types';
import {
  escapeAttr,
  escapeHtml,
  FALLBACK_COVER,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFileSize,
} from './format';

/** 转换任务状态机：pending → converting → completed | failed */
export interface ConversionTask {
  id: string;
  title: string;
  status: 'pending' | 'converting' | 'completed' | 'failed';
  outputPath?: string;
  error?: string;
}

const ICON_INFO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M12 12v4"/></svg>';

const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>';

const ICON_DB =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>';

/** 单集列表行。data-file-id / data-info-id / data-convert-id 供事件委托定位。 */
export function renderEpisodeRow(file: EpisodeInfo, checked: boolean): string {
  const badges: string[] = [];
  if (file.isFavorited) badges.push('<span class="badge badge-favorite">收藏</span>');
  if (file.isFinished) badges.push('<span class="badge badge-finished">已听完</span>');
  if (file.isDownloaded) badges.push('<span class="badge badge-downloaded">已下载</span>');
  if (file.progress > 0 && !file.isFinished) {
    badges.push(`<span class="badge badge-progress">已播 ${file.progressPercent}%</span>`);
  }

  const coverUrl = file.image || file.podcastImage;
  const coverImg = coverUrl
    ? `<img src="${escapeAttr(coverUrl)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_COVER}'">`
    : `<img src="${FALLBACK_COVER}" alt="">`;

  const id = escapeAttr(file.id);
  const localInfo = file.isDownloaded
    ? `<span class="episode-local">${escapeHtml(file.localFileFormat.toUpperCase())} · ${formatFileSize(file.localFileSize)}</span>`
    : '';

  return `
  <div class="episode-row${file.isDownloaded ? ' downloaded' : ''}">
    <input type="checkbox" class="episode-check" data-file-id="${id}"${checked ? ' checked' : ''}>
    <div class="episode-cover">${coverImg}</div>
    <div class="episode-main">
      <div class="episode-title-line">
        <span class="episode-title">${escapeHtml(file.title || '未命名单集')}</span>
        ${badges.join('')}
      </div>
      <div class="episode-sub">
        <span class="episode-podcast">${escapeHtml(file.podcastTitle || '未知播客')}</span>
        ${file.podcastAuthor ? `<span class="sep">·</span><span>${escapeHtml(file.podcastAuthor)}</span>` : ''}
        ${localInfo ? `<span class="sep">|</span>${localInfo}` : ''}
      </div>
      <div class="episode-stats">
        <span class="stat-num">${formatDate(file.pubDate)}</span>
        <span class="stat-num">${file.duration ? formatDuration(file.duration) : '—'}</span>
        <span>播放 <span class="stat-num">${file.playCount}</span></span>
        <span>评论 <span class="stat-num">${file.commentCount}</span></span>
        <span class="stat-num">${file.audioSize ? formatFileSize(file.audioSize) : '—'}</span>
      </div>
    </div>
    <div class="episode-actions">
      <button class="icon-btn" data-info-id="${id}" title="查看详情">${ICON_INFO}</button>
      ${file.isDownloaded ? `<button class="btn btn-primary btn-mini" data-convert-id="${id}" title="转换单集为 MP3">转 MP3</button>` : ''}
    </div>
  </div>`;
}

/** 转换任务行。converting 状态展示 indeterminate 进度条（由 CSS 动画驱动）。 */
export function renderTaskRow(task: ConversionTask): string {
  const statusText: Record<ConversionTask['status'], string> = {
    pending: '等待中',
    converting: '转换中',
    completed: '已完成',
    failed: '失败',
  };
  const ended = task.status === 'completed' || task.status === 'failed';
  const detail =
    task.status === 'completed' && task.outputPath
      ? `<div class="task-output">${escapeHtml(task.outputPath)}</div>`
      : task.status === 'failed' && task.error
        ? `<div class="task-output">${escapeHtml(task.error)}</div>`
        : '';

  return `
  <div class="task-row status-${task.status}">
    <span class="task-dot"></span>
    <div class="task-main">
      <div class="task-title">${escapeHtml(task.title || task.id)}</div>
      ${detail}
      <div class="task-progress"><div class="task-progress-fill"></div></div>
    </div>
    <span class="task-state">${statusText[task.status]}</span>
    ${ended ? `<button class="icon-btn" data-task-id="${escapeAttr(task.id)}" title="移除记录">${ICON_TRASH}</button>` : ''}
  </div>`;
}

/** 详情弹层主体（key-value 分区块布局）。 */
export function renderDetails(file: EpisodeInfo): string {
  const cover = file.image || file.podcastImage;
  const headBadges = [
    file.isFavorited ? '<span class="badge badge-favorite">收藏</span>' : '',
    file.isFinished ? '<span class="badge badge-finished">已听完</span>' : '',
    file.isDownloaded ? '<span class="badge badge-downloaded">已下载</span>' : '',
  ]
    .filter(Boolean)
    .join('');

  const progressText =
    file.progress > 0 ? `${formatDuration(file.progress)}（${file.progressPercent}%）` : '未播放';

  const row = (label: string, value: string, mono = false): string =>
    `<div class="detail-label">${label}</div><div class="detail-value${mono ? ' mono' : ''}">${value}</div>`;

  return `
    <div class="detail-head">
      <div class="detail-head-cover">${
        cover ? `<img src="${escapeAttr(cover)}" alt="" onerror="this.style.display='none'">` : ''
      }</div>
      <div class="detail-head-text">
        <div class="detail-head-title">${escapeHtml(file.title || '未命名单集')}</div>
        <div class="detail-head-sub">${escapeHtml(file.podcastTitle || '未知播客')}${
          file.podcastAuthor ? ` · ${escapeHtml(file.podcastAuthor)}` : ''
        }</div>
        ${headBadges ? `<div class="detail-head-badges">${headBadges}</div>` : ''}
      </div>
    </div>
    ${
      file.description
        ? `<div class="detail-section"><h3>简介</h3><div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(file.description)}</div></div>`
        : ''
    }
    <div class="detail-section">
      <h3>音频文件</h3>
      <div class="detail-grid">
        ${row('文件名', escapeHtml(file.audioFilename || '未知'))}
        ${row('大小', file.audioSize ? formatFileSize(file.audioSize) : '未知')}
        ${row('URL', escapeHtml(file.audioUrl || '未知'), true)}
        ${row('本地路径', escapeHtml(file.localPath || '未下载'), true)}
        ${row('加密密钥', escapeHtml(file.audioKey || '无'), true)}
      </div>
    </div>
    <div class="detail-section">
      <h3>播放与统计</h3>
      <div class="detail-grid">
        ${row('播放次数', `${file.playCount} 次`)}
        ${row('评论数', `${file.commentCount} 条`)}
        ${row('订阅数', `${file.subscriptionCount} 人`)}
        ${row('发布日期', formatDateTime(file.pubDate))}
        ${row('时长', file.duration ? formatDuration(file.duration) : '未知')}
        ${row('播放进度', progressText)}
        ${row('最后播放', file.lastPlayed ? formatDateTime(file.lastPlayed) : '从未播放')}
      </div>
    </div>
    <div class="detail-section">
      <h3>技术信息</h3>
      <div class="detail-grid">
        ${row('单集 ID', escapeHtml(file.id), true)}
        ${row('播客 ID', escapeHtml(file.podcastId || '未知'), true)}
        ${row('音频 EID', escapeHtml(file.audioEid || '未知'), true)}
      </div>
    </div>`;
}

/** 列表空态：区分「未加载」与「过滤无结果」。 */
export function renderEmptyState(hasFilter: boolean): string {
  if (hasFilter) {
    return '<div class="empty-state"><p>没有匹配的单集，试试更换关键词或过滤条件</p></div>';
  }
  return `<div class="empty-state">${ICON_DB}<p>连接数据库后加载单集列表</p></div>`;
}
