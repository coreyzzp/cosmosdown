const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// 清理 dist 目录
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

// 确保 dist 目录存在
fs.mkdirSync('dist', { recursive: true });
fs.mkdirSync('dist/renderer', { recursive: true });

console.log('🔨 使用 esbuild 构建项目...');

// 构建主进程
esbuild.build({
  entryPoints: ['src/main/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/main.js',
  external: ['electron', 'sqlite3', 'fluent-ffmpeg'],
  sourcemap: true,
  format: 'cjs',
}).then(() => {
  console.log('✅ 主进程构建完成: dist/main.js');
}).catch((error) => {
  console.error('❌ 主进程构建失败:', error);
  process.exit(1);
});

// 构建 preload 脚本
esbuild.build({
  entryPoints: ['src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/preload.js',
  external: ['electron'],
  sourcemap: true,
  format: 'cjs',
}).then(() => {
  console.log('✅ Preload 脚本构建完成: dist/preload.js');
}).catch((error) => {
  console.error('❌ Preload 脚本构建失败:', error);
  process.exit(1);
});

// 构建渲染进程
esbuild.build({
  entryPoints: ['src/renderer/renderer.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/renderer/renderer.js',
  sourcemap: true,
  format: 'iife',
  globalName: 'RendererApp',
}).then(() => {
  console.log('✅ 渲染进程构建完成: dist/renderer/renderer.js');
  
  // 复制静态文件
  console.log('📋 复制静态文件...');
  
  // 复制 HTML
  fs.copyFileSync(
    'src/renderer/index.html',
    'dist/renderer/index.html'
  );
  
  // 复制 CSS
  fs.copyFileSync(
    'src/renderer/styles.css',
    'dist/renderer/styles.css'
  );
  
  console.log('✅ 所有构建完成！');
}).catch((error) => {
  console.error('❌ 渲染进程构建失败:', error);
  process.exit(1);
});