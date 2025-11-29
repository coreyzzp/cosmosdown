export interface DatabaseConfig {
    path: string;
    readonly?: boolean;
}
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
export interface ConversionTask {
    id: string;
    sourceFile: string;
    targetFile: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    error?: string;
    createdAt: Date;
    completedAt?: Date;
}
export interface AppConfig {
    database: DatabaseConfig;
    outputDirectory: string;
    audioQuality: 'low' | 'medium' | 'high';
    maxConcurrentTasks: number;
}
export interface IPCMessage {
    type: string;
    payload?: any;
}
export type MainToRendererMessage = {
    type: 'task-progress';
    payload: {
        taskId: string;
        progress: number;
    };
} | {
    type: 'task-completed';
    payload: {
        taskId: string;
        result: string;
    };
} | {
    type: 'task-failed';
    payload: {
        taskId: string;
        error: string;
    };
} | {
    type: 'database-connected';
    payload: {
        path: string;
        autoConnected?: boolean;
        appInfo?: any;
    };
} | {
    type: 'files-found';
    payload: {
        files: AudioFileInfo[];
    };
};
export type RendererToMainMessage = {
    type: 'open-database';
    payload: {
        path: string;
    };
} | {
    type: 'start-conversion';
    payload: {
        fileId?: string;
        files?: string[];
        outputDir: string;
    };
} | {
    type: 'batch-conversion';
    payload: {
        fileIds: string[];
        outputDir: string;
    };
} | {
    type: 'get-files';
    payload: {};
} | {
    type: 'set-config';
    payload: AppConfig;
};
//# sourceMappingURL=index.d.ts.map