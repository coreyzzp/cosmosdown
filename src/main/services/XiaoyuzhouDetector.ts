import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 小宇宙应用检测器
 * 自动检测 macOS 上小宇宙应用的安装位置和用户数据
 */
export interface XiaoyuzhouUserInfo {
  userId: string;
  dbPath: string;
  audioFilePath: string;
  userStoragePath: string;
}

export interface XiaoyuzhouAppInfo {
  containerId: string;
  containerPath: string;
  documentsPath: string;
  users: XiaoyuzhouUserInfo[];
}

export class XiaoyuzhouDetector {
  private readonly CONTAINER_BASE_PATH: string;
  private readonly KNOWN_CONTAINER_IDS = [
    // '8A51F41B-4985-4AD1-B6C2-384D6EC1A651', // 小宇宙已知的容器ID
  ];

  constructor() {
    const homeDir = os.homedir();
    this.CONTAINER_BASE_PATH = path.join(homeDir, 'Library', 'Containers');
  }

  /**
   * 自动检测小宇宙应用
   */
  async detectXiaoyuzhouApp(): Promise<XiaoyuzhouAppInfo | null> {
    try {
      // 1. 首先尝试已知的容器ID
      for (const containerId of this.KNOWN_CONTAINER_IDS) {
        const appInfo = await this.checkContainer(containerId);
        if (appInfo) {
          console.log(`✅ 找到小宇宙应用 (已知容器): ${containerId}`);
          return appInfo;
        }
      }

      // 2. 如果已知容器ID不存在，搜索所有容器
      console.log('🔍 在所有容器中搜索小宇宙应用...');
      const appInfo = await this.searchAllContainers();
      if (appInfo) {
        console.log(`✅ 找到小宇宙应用 (搜索发现): ${appInfo.containerId}`);
        return appInfo;
      }

      console.warn('⚠️  未找到小宇宙应用安装');
      return null;
    } catch (error: any) {
      console.error('检测小宇宙应用失败:', error);
      return null;
    }
  }

  /**
   * 检查指定容器ID
   */
  private async checkContainer(containerId: string): Promise<XiaoyuzhouAppInfo | null> {
    const containerPath = path.join(this.CONTAINER_BASE_PATH, containerId);
    
    if (!fs.existsSync(containerPath)) {
      return null;
    }

    const documentsPath = path.join(containerPath, 'Data', 'Documents');
    
    if (!fs.existsSync(documentsPath)) {
      return null;
    }

    // 检查是否存在 UserStorages 目录（小宇宙特征）
    const userStoragesPath = path.join(documentsPath, 'UserStorages');
    if (!fs.existsSync(userStoragesPath)) {
      return null;
    }

    // 获取所有用户
    const users = await this.getUsersFromDocuments(documentsPath);
    
    if (users.length === 0) {
      return null;
    }

    return {
      containerId,
      containerPath,
      documentsPath,
      users
    };
  }

  /**
   * 搜索所有容器
   */
  private async searchAllContainers(): Promise<XiaoyuzhouAppInfo | null> {
    try {
      if (!fs.existsSync(this.CONTAINER_BASE_PATH)) {
        return null;
      }

      const containers = fs.readdirSync(this.CONTAINER_BASE_PATH);
      
      for (const containerId of containers) {
        // 跳过已知的容器ID（已经检查过了）
        if (this.KNOWN_CONTAINER_IDS.includes(containerId)) {
          continue;
        }

        const appInfo = await this.checkContainer(containerId);
        if (appInfo) {
          return appInfo;
        }
      }

      return null;
    } catch (error) {
      console.error('搜索容器失败:', error);
      return null;
    }
  }

  /**
   * 从 Documents 目录获取用户列表
   */
  private async getUsersFromDocuments(documentsPath: string): Promise<XiaoyuzhouUserInfo[]> {
    const users: XiaoyuzhouUserInfo[] = [];

    try {
      // 方法1: 从 UserStorages 目录读取用户ID
      const userStoragesPath = path.join(documentsPath, 'UserStorages');
      if (fs.existsSync(userStoragesPath)) {
        const userDirs = fs.readdirSync(userStoragesPath).filter(dir => {
          const fullPath = path.join(userStoragesPath, dir);
          return fs.statSync(fullPath).isDirectory();
        });

        for (const userId of userDirs) {
          const userInfo = this.getUserInfo(documentsPath, userId);
          if (userInfo) {
            users.push(userInfo);
          }
        }
      }

      // 方法2: 从 Documents 根目录读取用户ID（直接存在用户目录）
      if (users.length === 0) {
        const entries = fs.readdirSync(documentsPath).filter(entry => {
          const fullPath = path.join(documentsPath, entry);
          if (!fs.statSync(fullPath).isDirectory()) {
            return false;
          }
          // 检查是否有 db/cosmos.db
          const dbPath = path.join(fullPath, 'db', 'cosmos.db');
          return fs.existsSync(dbPath);
        });

        for (const userId of entries) {
          const userInfo = this.getUserInfo(documentsPath, userId);
          if (userInfo) {
            users.push(userInfo);
          }
        }
      }

      return users;
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return [];
    }
  }

  /**
   * 获取用户信息
   */
  private getUserInfo(documentsPath: string, userId: string): XiaoyuzhouUserInfo | null {
    // 用户存储路径可能在 Documents 根目录或 UserStorages 下
    const possiblePaths = [
      path.join(documentsPath, userId),
      path.join(documentsPath, 'UserStorages', userId)
    ];

    for (const userStoragePath of possiblePaths) {
      if (!fs.existsSync(userStoragePath)) {
        continue;
      }

      const dbPath = path.join(userStoragePath, 'db', 'cosmos.db');
      
      if (!fs.existsSync(dbPath)) {
        continue;
      }

      // 音频文件路径：/Documents/AudioFile/{userId}
      const audioFilePath = path.join(documentsPath, 'AudioFile', userId);

      return {
        userId,
        dbPath,
        audioFilePath,
        userStoragePath
      };
    }

    return null;
  }

  /**
   * 获取推荐的用户（如果只有一个用户，直接返回；否则返回第一个）
   */
  getRecommendedUser(appInfo: XiaoyuzhouAppInfo): XiaoyuzhouUserInfo | null {
    if (appInfo.users.length === 0) {
      return null;
    }

    // 如果只有一个用户，直接返回
    if (appInfo.users.length === 1) {
      console.log(`📌 自动选择唯一用户: ${appInfo.users[0].userId}`);
      return appInfo.users[0];
    }

    // 如果有多个用户，返回第一个（可以后续增加选择逻辑）
    console.log(`📌 发现 ${appInfo.users.length} 个用户，自动选择第一个: ${appInfo.users[0].userId}`);
    return appInfo.users[0];
  }

  /**
   * 格式化应用信息
   */
  formatAppInfo(appInfo: XiaoyuzhouAppInfo): string {
    const lines = [
      `容器ID: ${appInfo.containerId}`,
      `容器路径: ${appInfo.containerPath}`,
      `文档路径: ${appInfo.documentsPath}`,
      `用户数量: ${appInfo.users.length}`
    ];

    appInfo.users.forEach((user, index) => {
      lines.push(`\n用户 ${index + 1}:`);
      lines.push(`  - ID: ${user.userId}`);
      lines.push(`  - 数据库: ${user.dbPath}`);
      lines.push(`  - 音频文件: ${user.audioFilePath}`);
    });

    return lines.join('\n');
  }
}
