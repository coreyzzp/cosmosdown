/** 小宇宙单集完整信息。与 Rust `services::EpisodeInfo` 一一对应（serde camelCase 序列化）。 */
export interface EpisodeInfo {
  id: string;
  title: string | null;
  description: string | null;
  image: string | null;
  duration: number | null;
  pubDate: number | null;
  playCount: number;
  commentCount: number;
  isFavorited: boolean;
  isFinished: boolean;
  podcastId: string | null;
  podcastTitle: string | null;
  podcastAuthor: string | null;
  podcastDescription: string | null;
  podcastImage: string | null;
  subscriptionCount: number;
  audioEid: string | null;
  audioFilename: string | null;
  audioUrl: string | null;
  audioSize: number;
  audioKey: string | null;
  localPath: string | null;
  isDownloaded: boolean;
  localFileSize: number;
  localFileFormat: string;
  progress: number;
  progressPercent: number;
  lastPlayed: number | null;
}

/** 批量转换单条结果。与 Rust `commands::BatchConversionResult` 对应。 */
export interface BatchConversionResult {
  fileId: string;
  success: boolean;
  outputPath: string | null;
  error: string | null;
}

/** 自动检测结果。与 Rust `XiaoyuzhouAppInfo` 对应。 */
export interface XiaoyuzhouAppInfo {
  containerId: string;
  containerPath: string;
  documentsPath: string;
  users: Array<{
    userId: string;
    dbPath: string;
    audioFilePath: string;
    userStoragePath: string;
  }>;
}

/**
 * Rust 侧通过 `app-message` 事件推送的消息（discriminated union，type 字段区分）。
 * 前端在 `main.ts` 的 `setupAppMessageListener` 中统一消费。
 */
export type MainToRendererMessage =
  | { type: 'database-connected'; path: string; autoConnected?: boolean }
  | { type: 'batch-started'; total: number }
  | { type: 'task-started'; taskId: string; title?: string }
  | { type: 'task-completed'; taskId: string; outputPath: string }
  | { type: 'task-failed'; taskId: string; error: string };

/** 渲染进程主动发起的调用载荷，由 `api/bridge.ts` 转发到对应 Rust command。 */
export type RendererToMainMessage =
  | { type: 'open-database'; payload: { path: string } }
  | { type: 'get-files' }
  | { type: 'start-conversion'; payload: { fileId: string; outputDir: string } }
  | { type: 'batch-conversion'; payload: { fileIds: string[]; outputDir: string } }
  | { type: 'set-config'; payload: { audioQuality: string; maxConcurrentTasks: number } };
