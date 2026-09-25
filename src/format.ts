/** 纯格式化与转义工具。无副作用，可作为单测对象。 */

/** HTML 转义（字符串替换实现，用于所有插值进 innerHTML 的动态内容）。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 转义后用于 HTML 属性（src/href/data-*），额外覆盖反引号与控制符。 */
export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/`/g, '&#96;');
}

/** 字节数 → 可读大小。对 0/小于 1 字节/超大值均安全。 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

/** 秒 → m:ss / h:mm:ss。 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Unix 秒级时间戳 → YYYY-MM-DD。 */
export function formatDate(seconds: number | null): string {
  if (!seconds) return '未知';
  const d = new Date(seconds * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Unix 秒级时间戳 → YYYY-MM-DD HH:mm。 */
export function formatDateTime(seconds: number | null): string {
  if (!seconds) return '未知';
  const d = new Date(seconds * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(seconds)} ${hh}:${mi}`;
}

/** 封面加载失败时使用的内置占位图（灰色底 + 声波图标）。 */
export const FALLBACK_COVER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
      `<rect width="96" height="96" fill="#ececf0"/>` +
      `<g stroke="#b9b9c0" stroke-width="4" stroke-linecap="round">` +
      `<line x1="28" y1="42" x2="28" y2="54"/><line x1="38" y1="34" x2="38" y2="62"/>` +
      `<line x1="48" y1="28" x2="48" y2="68"/><line x1="58" y1="34" x2="58" y2="62"/>` +
      `<line x1="68" y1="42" x2="68" y2="54"/>` +
      `</g></svg>`
  );
