# MiniUBrowser - 音频文件转换器

一个基于 Electron 和 TypeScript 的跨平台音频文件转换工具，可以从 SQLite 数据库中读取音频文件路径并将其转换为 MP3 格式。

## 功能特性

- 🗄️ **SQLite 数据库支持**: 连接并读取 SQLite 数据库中的音频文件信息
- 🎵 **多格式音频转换**: 支持将多种音频格式转换为 MP3
- 📊 **实时进度显示**: 转换过程中显示详细的进度信息
- 🔄 **批量处理**: 支持同时转换多个音频文件
- 🎛️ **质量控制**: 可选择不同的音频质量（低/中/高）
- 🖥️ **跨平台**: 支持 macOS、Windows 和 Linux
- 🎨 **现代化界面**: 美观的用户界面，支持响应式设计

## 技术栈

- **框架**: Electron
- **语言**: TypeScript
- **数据库**: SQLite3
- **音频处理**: FFmpeg (通过 fluent-ffmpeg)
- **构建工具**: TypeScript Compiler
- **打包工具**: Electron Builder

## 系统要求

### 基本要求
- Node.js 18+ 
- npm 或 yarn

### 音频转换功能
- FFmpeg (需要单独安装)

#### macOS 安装 FFmpeg
```bash
# 使用 Homebrew 安装
brew install ffmpeg
```

#### Windows 安装 FFmpeg
1. 从 [FFmpeg 官网](https://ffmpeg.org/download.html) 下载
2. 解压并添加到系统 PATH

#### Linux 安装 FFmpeg
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

## 安装和运行

### 1. 克隆项目
```bash
git clone <repository-url>
cd miniubrowser
```

### 2. 安装依赖
```bash
npm install
```

### 3. 开发模式运行
```bash
npm run dev
```

### 4. 构建项目
```bash
npm run build
```

### 5. 打包应用
```bash
# 打包当前平台
npm run pack

# 构建发布版本
npm run dist
```

## 项目结构

```
miniubrowser/
├── src/
│   ├── main/                 # 主进程代码
│   │   ├── main.ts          # 主进程入口
│   │   ├── preload.ts       # 预加载脚本
│   │   └── services/        # 服务模块
│   │       ├── DatabaseService.ts  # 数据库服务
│   │       └── AudioProcessor.ts   # 音频处理服务
│   ├── renderer/            # 渲染进程代码
│   │   ├── index.html       # 主界面
│   │   ├── styles.css       # 样式文件
│   │   └── renderer.ts      # 渲染进程逻辑
│   ├── shared/              # 共享代码
│   ├── types/               # TypeScript 类型定义
│   │   └── index.ts
│   └── utils/               # 工具函数
├── dist/                    # 编译输出目录
├── release/                 # 打包输出目录
├── package.json
├── tsconfig.json
└── README.md
```

## 使用说明

### 1. 连接数据库
1. 点击"选择数据库"按钮，选择包含音频文件信息的 SQLite 数据库
2. 点击"连接"按钮建立数据库连接

### 2. 设置输出目录
1. 点击"选择目录"按钮，选择转换后文件的保存位置
2. 选择音频质量（低/中/高质量）

### 3. 选择文件
1. 连接数据库后，文件列表会显示所有找到的音频文件
2. 使用复选框选择要转换的文件
3. 可以使用"全选"/"取消全选"按钮快速操作

### 4. 开始转换
1. 点击"开始转换"按钮启动转换过程
2. 转换进度会实时显示在进度区域
3. 转换完成后，文件会保存到指定的输出目录

## 数据库结构要求

应用会自动尝试识别数据库中的音频文件信息。支持的表结构包括：

### 标准音频文件表
```sql
CREATE TABLE audio_files (
    id INTEGER PRIMARY KEY,
    file_path TEXT,           -- 文件路径
    file_name TEXT,           -- 文件名
    file_size INTEGER,        -- 文件大小
    duration REAL,            -- 时长（秒）
    format TEXT,              -- 格式
    created_at DATETIME,      -- 创建时间
    updated_at DATETIME       -- 更新时间
);
```

### 通用文件表
```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    path TEXT,                -- 文件路径
    name TEXT,                -- 文件名
    size INTEGER,             -- 文件大小
    type TEXT,                -- 文件类型
    created_time DATETIME,
    modified_time DATETIME
);
```

应用会自动尝试多种表结构和字段名组合，以最大程度兼容不同的数据库设计。

## 开发指南

### 添加新功能
1. 在 `src/types/index.ts` 中定义相关类型
2. 在主进程中实现业务逻辑
3. 在渲染进程中添加用户界面
4. 通过 IPC 通信连接前后端

### 调试
- 开发模式下会自动打开开发者工具
- 主进程日志会输出到终端
- 渲染进程日志会显示在开发者工具中

### 测试
```bash
npm test
```

## 常见问题

### Q: 提示"FFmpeg未找到"
A: 请确保系统中已安装 FFmpeg 并添加到 PATH 环境变量中。

### Q: 数据库连接失败
A: 请检查：
- 数据库文件是否存在
- 文件是否有读取权限
- 数据库文件是否损坏

### Q: 找不到音频文件
A: 请检查：
- 数据库中是否包含音频文件路径信息
- 路径中的文件是否实际存在
- 文件格式是否受支持

### Q: 转换失败
A: 可能的原因：
- 源文件损坏或格式不支持
- 输出目录没有写入权限
- FFmpeg 版本不兼容

## 支持的音频格式

**输入格式**: MP3, WAV, FLAC, M4A, AAC, OGG, WMA, AIFF, AU, RA
**输出格式**: MP3

## 许可证

ISC License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0
- 初始版本发布
- 支持 SQLite 数据库连接
- 支持音频文件转换
- 支持批量处理
- 现代化用户界面