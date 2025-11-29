/**
 * Cosmos 数据库类型定义
 * 基于实际数据库表结构
 */

// ==================== AudioFileTable_v2 ====================
/**
 * 音频文件表
 * 存储音频文件的下载信息和元数据
 */
export interface AudioFile {
  /** 音频文件的在线 URL 地址 */
  url: string;
  /** 唯一标识符 (主键) */
  eid: string;
  /** 文件名 */
  name: string;
  /** 文件大小 (MB) */
  size: number;
  /** 音频加密密钥或下载密钥 */
  audioKey: string;
}

// ==================== Playlist ====================
/**
 * 播放列表/单集信息表
 * 存储播客单集的详细信息
 */
export interface Playlist {
  /** 唯一标识符 (主键) */
  id: string;
  /** 播客 ID (关联到 PlaylistPodcast) */
  pid: string;
  /** 状态 */
  status: string;
  /** 审核状态 */
  reviewStatus: string;
  /** 可见性设置 */
  visibility: string;
  /** 标题 */
  title: string;
  /** 描述 */
  description: string;
  /** 节目备注 */
  shownotes: string;
  /** 封面图片 URL */
  image: string;
  /** 评论数量 */
  commentCount: number;
  /** 播放次数 */
  playCount: number;
  /** 时长 (秒) */
  duration: number;
  /** 发布日期 (时间戳) */
  pubDate: number;
  /** 是否已收藏 (0/1) */
  isFavorited: number;
  /** 是否已完成 (0/1) */
  isFinished: number;
  /** 是否精选 (0/1) */
  isPicked: number;
  /** 权限信息 (BLOB) */
  permissions: Buffer | null;
  /** 付费类型 */
  payType: string;
  /** 是否拥有 (0/1) */
  isOwned: number;
  /** 试用信息 */
  trialInfo: string;
  /** 微信分享样式 */
  wechatShareStyle: string;
  /** 微信分享链接 */
  wechatShareUrl: string;
  /** 试点信息 */
  pilotInfo: string;
  /** 媒体信息 */
  media: string;
  /** 是否自定义 (0/1) */
  isCustomized: number;
  /** 风险警告 */
  riskWarning: string;
  /** 话题 ID */
  topicId: string;
}

// ==================== PlaylistPodcast ====================
/**
 * 播客信息表
 * 存储播客频道的详细信息
 */
export interface PlaylistPodcast {
  /** 唯一标识符 (主键) */
  id: string;
  /** 播客标题 */
  title: string;
  /** 作者/创作者 */
  author: string;
  /** 描述 */
  description: string;
  /** 封面图片 URL */
  image: string;
  /** 同步模式 */
  syncMode: string;
  /** 订阅状态 */
  subscriptionState: string;
  /** 是否开启推送 (0/1) */
  pushOn: number;
  /** 订阅人数 */
  subscriptionCount: number;
  /** 最新一集发布时间 (时间戳) */
  latestEpisodePubDate: number;
  /** 状态 */
  status: string;
  /** 审核状态 */
  reviewStatus: string;
  /** 微博名称 */
  weiboName: string;
  /** 权限信息 (BLOB) */
  permissions: Buffer | null;
  /** 主题颜色 */
  themeColor: string;
  /** 付费类型 */
  payType: string;
  /** 是否拥有 (0/1) */
  isOwned: number;
  /** 背景图片 */
  background: string;
  /** 单集数量 */
  episodeCount: number;
  /** 是否有热门单集 (0/1) */
  hasPopularEpisodes: number;
  /** 是否自定义 (0/1) */
  isCustomized: number;
  /** 是否有话题 (0/1) */
  hasTopic: number;
  /** 话题标签 (BLOB) */
  topicLabels: Buffer | null;
  /** 订阅星级 */
  subscriptionStar: number;
}

// ==================== PlaylistProgress ====================
/**
 * 播放进度表
 * 记录用户的播放进度
 */
export interface PlaylistProgress {
  /** 播放列表 ID (主键，关联到 Playlist) */
  id: string;
  /** 播放进度 (秒) */
  idProgress: number;
  /** 播放时间 (时间戳) */
  playedAt: number;
}

// ==================== PlaylistIndex ====================
/**
 * 播放列表索引表
 * 记录播放列表的索引位置
 */
export interface PlaylistIndex {
  /** 播放列表 ID (主键) */
  id: string;
  /** 索引位置 */
  idIndex: number;
}

// ==================== LastSyncedPlaylistIndex ====================
/**
 * 最后同步的播放列表索引表
 */
export interface LastSyncedPlaylistIndex {
  /** 播放列表 ID (主键) */
  id: string;
  /** 索引位置 */
  idIndex: number;
}

// ==================== PodcastPlaybackRate ====================
/**
 * 播客播放速率表
 * 记录播客的播放速度设置
 */
export interface PodcastPlaybackRate {
  /** 播客 ID (主键) */
  id: string;
  /** 播放速率 */
  playbackRate: number;
}

// ==================== 数据库完整结构 ====================
/**
 * Cosmos 数据库完整结构
 */
export interface CosmosDatabase {
  /** 音频文件表 */
  audioFiles: AudioFile[];
  /** 播放列表/单集表 */
  playlists: Playlist[];
  /** 播客信息表 */
  podcasts: PlaylistPodcast[];
  /** 播放进度表 */
  progress: PlaylistProgress[];
  /** 播放列表索引表 */
  playlistIndex: PlaylistIndex[];
  /** 最后同步索引表 */
  lastSyncedIndex: LastSyncedPlaylistIndex[];
  /** 播放速率表 */
  playbackRates: PodcastPlaybackRate[];
}

// ==================== 辅助类型 ====================
/**
 * 音频文件扩展信息
 * 包含本地路径和转换状态
 */
export interface AudioFileWithLocal extends AudioFile {
  /** 本地文件路径 (如果已下载) */
  localPath?: string;
  /** 是否已下载 */
  isDownloaded: boolean;
  /** 转换状态 */
  conversionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  /** 转换后的文件路径 */
  convertedPath?: string;
}

/**
 * 播放列表扩展信息
 * 包含关联的播客和音频文件信息
 */
export interface PlaylistWithDetails extends Playlist {
  /** 关联的播客信息 */
  podcast?: PlaylistPodcast;
  /** 关联的音频文件 */
  audioFile?: AudioFile;
  /** 播放进度 */
  progress?: PlaylistProgress;
}