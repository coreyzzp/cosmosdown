# 快速开始指南

## 🚀 首次安装和运行

### 1. 安装依赖
```bash
npm install
```

### 2. 重建原生模块（重要！）
```bash
npm run rebuild
```

**注意：** 每次以下情况都需要重新运行 `npm run rebuild`：
- 首次安装项目
- 更新了 Electron 版本
- 更新了 Node.js 版本
- 切换了电脑或操作系统

### 3. 运行应用
```bash
# 开发模式（自动构建并启动）
npm run dev

# 或者先构建再启动
npm run build
npm start
```

## 🎯 常用命令

```bash
# 开发和调试
npm run dev          # 构建并启动应用（开发模式）
npm run build        # 仅构建代码
npm start            # 启动已构建的应用

# 原生模块
npm run rebuild      # 重新编译原生模块（sqlite3）

# 打包发布
npm run dist:mac     # 打包 macOS 版本（DMG + ZIP）
npm run dist:win     # 打包 Windows 版本
npm run dist:linux   # 打包 Linux 版本

# 清理
npm run clean        # 清理构建和发布目录
```

## ⚠️ 常见问题

### 问题 1: 启动时报错 "Could not locate the bindings file"

**原因：** sqlite3 原生模块未正确编译。

**解决方案：**
```bash
npm run rebuild
```

### 问题 2: FFmpeg 功能不可用

**原因：** 系统未安装 FFmpeg。

**解决方案（macOS）：**
```bash
brew install ffmpeg
```

**解决方案（其他系统）：** 参考 BUILD.md

### 问题 3: 应用打包后无法打开（macOS）

**原因：** macOS 安全限制。

**解决方案：**
```bash
# 移除隔离属性
xattr -cr /Applications/MiniUBrowser.app
```

或者在系统设置中允许运行。

## 📁 项目结构

```
miniubrowser/
├── src/              # 源代码
│   ├── main/         # 主进程（Node.js + Electron）
│   ├── renderer/     # 渲染进程（前端界面）
│   ├── types/        # TypeScript 类型定义
│   └── utils/        # 工具函数
├── dist/             # 构建输出（git ignored）
├── release/          # 打包输出（git ignored）
├── assert/           # 资源文件（图标等）
├── scripts/          # 构建脚本
└── package.json      # 项目配置
```

## 🔧 开发流程

1. **修改代码** - 编辑 `src/` 目录下的文件
2. **构建** - 运行 `npm run build` 或使用 `npm run dev`
3. **测试** - 应用会自动启动（dev 模式）或手动运行 `npm start`
4. **调试** - 开发模式会自动打开 DevTools
5. **打包** - 测试完成后运行 `npm run dist:mac` 打包

## 💡 开发技巧

### 实时调试
开发模式下会自动打开 Chrome DevTools，可以：
- 查看 Console 日志
- 调试渲染进程代码
- 检查网络请求
- 查看数据库查询

### 修改后快速重新加载
```bash
npm run build && npm start
```

### 查看主进程日志
主进程的 `console.log` 会输出到终端，渲染进程的会输出到 DevTools。

## 📦 打包流程

### macOS
```bash
npm run dist:mac
```

生成文件位于 `release/` 目录：
- `MiniUBrowser-1.0.0.dmg` - 安装镜像
- `MiniUBrowser-1.0.0-mac.zip` - ZIP 压缩包
- `mac-arm64/MiniUBrowser.app` - 应用包

### Windows / Linux
参考 BUILD.md 文档中的详细说明。

## 🆘 获取帮助

1. 查看 [BUILD.md](./BUILD.md) - 详细的构建和打包文档
2. 查看 [README.md](./README.md) - 项目说明和功能介绍
3. 检查终端输出的错误信息
4. 确保所有依赖都已正确安装

## ✅ 检查清单

安装后请确认：

- [ ] 依赖安装完成：`npm install`
- [ ] 原生模块已编译：`npm run rebuild`
- [ ] FFmpeg 已安装：`ffmpeg -version`
- [ ] 应用可以启动：`npm start`
- [ ] 可以连接数据库
- [ ] 转换功能正常工作

全部完成后，你就可以开始使用和开发 MiniUBrowser 了！
