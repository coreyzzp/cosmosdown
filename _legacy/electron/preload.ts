import { contextBridge, ipcRenderer } from 'electron';
import { RendererToMainMessage, MainToRendererMessage } from '../types';

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 发送消息到主进程
  sendMessage: (message: RendererToMainMessage) => {
    switch (message.type) {
      case 'open-database':
        return ipcRenderer.invoke('open-database', message);
      case 'get-files':
        return ipcRenderer.invoke('get-files', message);
      case 'start-conversion':
        return ipcRenderer.invoke('start-conversion', message);
      case 'set-config':
        return ipcRenderer.invoke('set-config', message);
      default:
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
  },

  // 监听主进程消息
  onMessage: (callback: (message: MainToRendererMessage) => void) => {
    ipcRenderer.on('main-message', (event, message) => {
      callback(message);
    });
  },

  // 移除监听器
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('main-message');
  },

  // 文件选择对话框
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectDatabase: () => ipcRenderer.invoke('select-database'),

  // 获取平台信息
  platform: process.platform,
  
  // 应用版本
  version: process.env.npm_package_version || '1.0.0'
});

// 类型声明，供渲染进程使用
declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: RendererToMainMessage) => Promise<any>;
      onMessage: (callback: (message: MainToRendererMessage) => void) => void;
      removeAllListeners: () => void;
      selectFolder: () => Promise<{ success: boolean; path?: string }>;
      selectDatabase: () => Promise<{ success: boolean; path?: string }>;
      platform: string;
      version: string;
    };
  }
}