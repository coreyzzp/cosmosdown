# 构建和打包指南

## 前置要求

### macOS 打包
- Node.js (推荐 v18+)
- npm 或 yarn
- **重要：需要安装 FFmpeg**
  ```bash
  # 使用 Homebrew 安装
  brew install ffmpeg
  ```

### Windows 打包
- Node.js (推荐 v18+)
- npm 或 yarn
- FFmpeg (需要添加到系统 PATH)

### Linux 打包
- Node.js (推荐 v18+)
- npm 或 yarn
- FFmpeg

## 安装依赖

```bash
npm install
```

**重要：** 安装依赖后，必须重新编译原生模块以匹配 Electron 版本：

```bash
npm run rebuild
```

这个命令会：
1. 重新编译 sqlite3 模块
2. 使用 electron-rebuild 针对 Electron 版本重新构建

**注意：** 每次以下情况都需要重新运行 `npm run rebuild`：
- 首次安装项目
- 更新了 Electron 版本
- 更新了 Node.js 版本
- `npm start` 报错 "Could not locate the bindings file"

## 开发模式

```bash
# 构建并运行应用（开发模式）
npm run dev

# 仅构建（不运行）
npm run build

# 运行已构建的应用
npm start
```

## 打包应用

### macOS

```bash
# 打包为 DMG 和 ZIP 格式
npm run dist:mac

# 或者只打包不构建 DMG
npm run pack:mac
```

打包完成后，文件位于 `release/` 目录：
- `MiniUBrowser-{version}.dmg` - DMG 安装包
- `MiniUBrowser-{version}-mac.zip` - ZIP 压缩包
- `mac-arm64/MiniUBrowser.app` - 应用程序包（Apple Silicon）
- `mac-x64/MiniUBrowser.app` - 应用程序包（Intel）

### Windows

```bash
npm run dist:win
```

打包完成后，文件位于 `release/` 目录：
- `MiniUBrowser Setup {version}.exe` - 安装程序

### Linux

```bash
npm run dist:linux
```

打包完成后，文件位于 `release/` 目录：
- `MiniUBrowser-{version}.AppImage` - AppImage 格式

### 全平台打包

```bash
# 为所有平台打包（需要在对应系统上运行）
npm run dist
```

## 应用图标

应用图标位于 `assert/icon.png`。electron-builder 会自动将 PNG 格式转换为各平台所需的格式：
- macOS: `.icns`
- Windows: `.ico`
- Linux: `.png`

### 自定义图标

如果要更换图标，替换 `assert/icon.png` 文件即可。建议使用：
- 最小尺寸：512x512 像素
- 推荐尺寸：1024x1024 像素
- 格式：PNG（透明背景）

## 清理构建文件

```bash
# 清理 dist 和 release 目录
npm run clean
```

## 目录结构

```
miniubrowser/
├── assert/              # 资源文件（图标等）
│   └── icon.png        # 应用图标
├── build/              # 构建配置
│   └── entitlements.mac.plist  # macOS 权限配置
├── dist/               # 构建输出目录
│   ├── main.js         # 主进程代码
│   ├── preload.js      # 预加载脚本
│   └── renderer/       # 渲染进程资源
├── release/            # 打包输出目录
├── src/                # 源代码
│   ├── main/           # 主进程
│   ├── renderer/       # 渲染进程
│   ├── types/          # TypeScript 类型定义
│   └── utils/          # 工具函数
├── scripts/            # 构建脚本
└── package.json        # 项目配置
```

## 常见问题

### 1. FFmpeg 未找到

**问题：** 应用启动后转换功能不可用，提示 FFmpeg 未安装。

**解决方案：**
- macOS: `brew install ffmpeg`
- Windows: 下载 FFmpeg 并添加到系统 PATH
- Linux: `sudo apt install ffmpeg` 或 `sudo yum install ffmpeg`

### 2. 打包后应用无法打开（macOS）

**问题：** 双击应用提示"已损坏"或"无法验证开发者"。

**解决方案：**
```bash
# 移除隔离属性
xattr -cr /Applications/MiniUBrowser.app

# 或者在系统偏好设置中允许"任何来源"的应用
sudo spctl --master-disable
```

### 3. 原生模块编译失败

**问题：** `sqlite3` 等原生模块编译失败，或启动时提示 "Could not locate the bindings file"。

**解决方案：**
```bash
# 重新构建原生模块
npm run rebuild

# 或手动重建
npx electron-rebuild -f -w sqlite3
```

**注意：** 如果更新了 Electron 版本或 Node.js 版本，必须重新编译原生模块。

### 4. 打包体积过大

**解决方案：**
- 检查 `node_modules` 是否包含不必要的依赖
- 使用 `npm prune --production` 删除开发依赖
- 在 `package.json` 的 `build.files` 中排除不需要的文件

## 发布检查清单

在发布新版本前，请确认：

- [ ] 更新 `package.json` 中的版本号
- [ ] 测试所有核心功能
- [ ] 确认 FFmpeg 路径检测正常工作
- [ ] 测试数据库连接和文件转换
- [ ] 检查应用图标显示正常
- [ ] 在目标平台上测试打包后的应用
- [ ] 更新 CHANGELOG.md（如果有）

## 配置说明

### electron-builder 配置

在 `package.json` 的 `build` 字段中配置：

```json
{
  "build": {
    "appId": "com.corey.miniubrowser",
    "productName": "MiniUBrowser",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.utilities",
      "target": ["dmg", "zip"],
      "icon": "assert/icon.png"
    }
  }
}
```

### macOS 权限配置

`build/entitlements.mac.plist` 配置了应用所需的权限，包括：
- JIT 编译
- 无签名可执行内存访问
- 动态库环境变量
- 禁用库验证

这些权限确保应用能够正常运行 Electron 和原生模块。

## 技术栈

- **框架：** Electron
- **语言：** TypeScript
- **构建工具：** esbuild
- **打包工具：** electron-builder
- **音频处理：** FFmpeg (fluent-ffmpeg)
- **数据库：** SQLite3

## 许可证

ISC
