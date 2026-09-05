// 새 버전이 나왔는지 확인한다. 크롬 웹스토어에 올린 확장이 아니라
// 자동 업데이트가 안 되므로, 알려 주고 받으러 갈 곳만 안내한다.

const REPO = 'egg-silver/amaranth-worktime-extension';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/master/manifest.json`;

export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * '1.2.10' 같은 점 구분 버전을 비교한다.
 * a 가 b 보다 높으면 1, 낮으면 -1, 같으면 0.
 */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * 저장소의 manifest.json 에서 최신 버전을 읽는다.
 * GitHub API 가 아니라 raw 파일이라 호출 횟수 제한에 걸리지 않는다.
 */
export async function fetchLatestVersion() {
  const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`버전 확인 실패 (HTTP ${res.status})`);
  const { version } = await res.json();
  if (!/^\d+(\.\d+)*$/.test(String(version || ''))) {
    throw new Error('버전 형식을 알아볼 수 없어요.');
  }
  return String(version);
}
