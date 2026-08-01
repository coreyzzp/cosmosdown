import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { MainToRendererMessage, RendererToMainMessage } from '../types';

export type PathPickerResult = { success: boolean; path?: string };

/**
 * Frontend bridge that replaces the old Electron preload API.
 * Backend commands live in src-tauri; progress events use the `app-message` channel.
 */
export const appAPI = {
  async sendMessage(message: RendererToMainMessage): Promise<any> {
    switch (message.type) {
      case 'open-database':
        return invoke('open_database', { path: message.payload.path });
      case 'get-files':
        return invoke('get_files');
      case 'start-conversion':
        return invoke('start_conversion', {
          fileId: message.payload.fileId,
          outputDir: message.payload.outputDir,
        });
      case 'batch-conversion':
        return invoke('batch_conversion', {
          fileIds: message.payload.fileIds,
          outputDir: message.payload.outputDir,
        });
      case 'set-config':
        return invoke('set_config', { config: message.payload });
      default:
        throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
    }
  },

  onMessage(callback: (message: MainToRendererMessage) => void): UnlistenFn | Promise<UnlistenFn> {
    return listen<MainToRendererMessage>('app-message', (event) => {
      callback(event.payload);
    });
  },

  async removeAllListeners(unlisten?: UnlistenFn): Promise<void> {
    if (unlisten) {
      unlisten();
    }
  },

  selectFolder(): Promise<PathPickerResult> {
    return invoke('select_folder');
  },

  selectDatabase(): Promise<PathPickerResult> {
    return invoke('select_database');
  },

  platform: navigator.platform,

  version: '1.0.0',
};

// Keep a temporary alias so gradual migrations can still compile.
export const electronAPI = appAPI;
