import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions } from '../lib/update.js';

test('버전 비교는 자리별 숫자로 한다', () => {
  assert.equal(compareVersions('1.1.0', '1.0.1'), 1);
  assert.equal(compareVersions('1.0.1', '1.1.0'), -1);
  assert.equal(compareVersions('1.0.1', '1.0.1'), 0);
  // 문자열 비교라면 '1.10' < '1.9' 가 되어 새 버전을 놓친다
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('2', '1.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('알아볼 수 없는 값이 와도 터지지 않는다', () => {
  assert.equal(compareVersions('', '1.0.0'), -1);
  assert.equal(compareVersions('abc', '0.0.0'), 0);
});
