// 알림 항목을 다루는 순수 함수. 화면과 background 가 같이 쓴다.

/** 읽음 여부. readDate 는 항목별 값이고 비어 있으면 안 읽은 것이다. */
export function isUnread(alert) {
  return !/^\d{14}/.test(String(alert.readDate || ''));
}

export function countUnread(alerts) {
  return alerts.reduce((n, alert) => (isUnread(alert) ? n + 1 : n), 0);
}

/** '20260805120305592' → Date. 형식이 다르면 null. */
export function parseCreateDate(s) {
  const v = String(s || '');
  if (!/^\d{12}/.test(v)) return null;
  return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12));
}

/**
 * 신규 판정 기준값. alertId 가 없는 응답이 오면 내용 조합으로 대체한다.
 * 전부 비어 있으면 서로 구별할 수 없으므로 null 을 준다.
 */
export function alertIdentity(alert) {
  if (alert.alertId) return String(alert.alertId);
  const message = alert.message || {};
  const parts = [alert.eventType, alert.createDate, message.alertTitle, message.alertContent, alert.url].map(
    (p) => (p == null ? '' : String(p))
  );
  // 구분자는 본문에 나올 수 없는 NUL 을 써서 필드 경계가 밀리지 않게 한다.
  return parts.some((p) => p !== '') ? parts.join('\u0000') : null;
}

export function alertTitle(alert) {
  return alert.message?.alertTitle || '(제목 없음)';
}

export function alertContent(alert) {
  return alert.message?.alertContent || '';
}
