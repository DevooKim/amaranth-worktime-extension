import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnread, countUnread, parseCreateDate, alertIdentity, alertTitle } from '../lib/alerts.js';

test('readDate 가 14자리 시각이면 읽은 알림이다', () => {
  assert.equal(isUnread({ readDate: '20260805120305592' }), false);
  assert.equal(isUnread({ readDate: '' }), true);
  assert.equal(isUnread({}), true);
  assert.equal(countUnread([{ readDate: '' }, { readDate: '20260805120305' }, {}]), 2);
});

test('createDate 문자열을 Date 로 바꾼다', () => {
  const d = parseCreateDate('20260805120305592');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 12);
  assert.equal(d.getMinutes(), 3);
  assert.equal(parseCreateDate('abc'), null);
  assert.equal(parseCreateDate(''), null);
});

test('alertId 가 있으면 그것을, 없으면 내용 조합을 식별자로 쓴다', () => {
  assert.equal(alertIdentity({ alertId: 123 }), '123');
  const a = alertIdentity({ eventType: 'A', createDate: '1', message: { alertTitle: 't' } });
  const b = alertIdentity({ eventType: 'A', createDate: '1', message: { alertTitle: 't' } });
  const c = alertIdentity({ eventType: 'A', createDate: '2', message: { alertTitle: 't' } });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(alertIdentity({}), null);
});

test('제목이 없으면 대체 문구를 쓴다', () => {
  assert.equal(alertTitle({ message: { alertTitle: '결재 요청' } }), '결재 요청');
  assert.equal(alertTitle({}), '(제목 없음)');
});
