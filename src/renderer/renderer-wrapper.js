// 为浏览器环境创建 exports 对象
window.exports = {};
window.module = { exports: {} };

// 加载编译后的渲染进程代码
const script = document.createElement('script');
script.src = 'renderer.js';
script.onload = () => {
  console.log('渲染进程加载完成');
};
script.onerror = (error) => {
  console.error('渲染进程加载失败:', error);
};
document.head.appendChild(script);