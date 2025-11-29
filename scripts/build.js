const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 开始构建项目...');

try {
  // 清理 dist 目录
  if (fs.existsSync('dist')) {
    console.log('🧹 清理旧的构建文件...');
    fs.rmSync('dist', { recursive: true, force: true });
  }

  // 编译 TypeScript
  console.log('📦 编译 TypeScript...');
  execSync('npx tsc', { stdio: 'inherit' });

  // 复制静态文件
  console.log('📋 复制静态文件...');
  
  // 复制 HTML 和 CSS 文件
  const rendererSrc = path.join('src', 'renderer');
  const rendererDist = path.join('dist', 'renderer');
  
  if (!fs.existsSync(rendererDist)) {
    fs.mkdirSync(rendererDist, { recursive: true });
  }
  
  // 复制 HTML 文件
  if (fs.existsSync(path.join(rendererSrc, 'index.html'))) {
    fs.copyFileSync(
      path.join(rendererSrc, 'index.html'),
      path.join(rendererDist, 'index.html')
    );
  }
  
  // 复制 CSS 文件
  if (fs.existsSync(path.join(rendererSrc, 'styles.css'))) {
    fs.copyFileSync(
      path.join(rendererSrc, 'styles.css'),
      path.join(rendererDist, 'styles.css')
    );
  }

  // 编译 preload 脚本
  console.log('🔧 编译 preload 脚本...');
  execSync('npx tsc src/main/preload.ts --outDir dist/main --target es2020 --module commonjs --esModuleInterop', { stdio: 'inherit' });

  console.log('✅ 构建完成！');
  console.log('💡 运行 "npm start" 启动应用');

} catch (error) {
  console.error('❌ 构建失败:', error.message);
  process.exit(1);
}