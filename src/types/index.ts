// 数据库配置接口
export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
}

// 音频文件信息接口
export interface AudioFileInfo {
  id: number;
  originalPath: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  format?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 转换任务接口
export interface ConversionTask {
  id: string;
  sourceFile: string;
  targetFile: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    comment?: string;
    coverUrl?: string;
  };
}

// 应用配置接口
export interface AppConfig {
  database: DatabaseConfig;
  outputDirectory: string;
  audioQuality: 'low' | 'medium' | 'high';
  maxConcurrentTasks: number;
}

// IPC通信消息类型
export interface IPCMessage {
  type: string;
  payload?: any;
}

// 主进程到渲染进程的消息类型
export type MainToRendererMessage = 
  | { type: 'task-progress'; payload: { taskId: string; progress: number } }
  | { type: 'task-completed'; payload: { taskId: string; result: string } }
  | { type: 'task-failed'; payload: { taskId: string; error: string } }
  | { type: 'database-connected'; payload: { path: string; autoConnected?: boolean; appInfo?: any } }
  | { type: 'files-found'; payload: { files: AudioFileInfo[] } };

// 渲染进程到主进程的消息类型
export type RendererToMainMessage =
  | { type: 'open-database'; payload: { path: string } }
  | { type: 'start-conversion'; payload: { fileId?: string; files?: string[]; outputDir: string } }
  | { type: 'batch-conversion'; payload: { fileIds: string[]; outputDir: string } }
  | { type: 'get-files'; payload: {} }
  | { type: 'set-config'; payload: AppConfig };