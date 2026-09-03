// 안 읽은 알림이 있으면 툴바 아이콘 오른쪽 위에 빨간 점을 올린다.
// chrome.action 에는 점 표시 API 가 없어 아이콘 이미지에 직접 합성한다.

const SIZES = [16, 32];
const SOURCE_ICON = 'icons/icon128.png';
const PLAIN_PATHS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

const DOT_FILL = '#da3944';
const DOT_RING = '#ffffff';
const DOT_RADIUS = 0.3;
const RING_INNER = 0.72;

let sourceBitmap = null;

async function loadSource() {
  if (sourceBitmap) return sourceBitmap;
  const res = await fetch(chrome.runtime.getURL(SOURCE_ICON));
  sourceBitmap = await createImageBitmap(await res.blob());
  return sourceBitmap;
}

async function renderDotIcon() {
  const bitmap = await loadSource();
  const imageData = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, size, size);

    const r = size * DOT_RADIUS;
    const cx = size - r;
    const cy = r;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = DOT_RING;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r * RING_INNER, 0, Math.PI * 2);
    ctx.fillStyle = DOT_FILL;
    ctx.fill();

    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

/** count > 0 이면 점을 올리고, 아니면 원래 아이콘으로 되돌린다. */
export async function setUnreadDot(count) {
  try {
    if (count > 0) await chrome.action.setIcon({ imageData: await renderDotIcon() });
    else await chrome.action.setIcon({ path: PLAIN_PATHS });
  } catch (err) {
    // 아이콘 표시는 부가 기능이다. 실패해도 알림 폴링은 계속돼야 한다.
    console.warn('[gw-worktime] 아이콘 갱신 실패:', err?.message || err);
  }
}
