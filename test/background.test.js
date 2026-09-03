// background.js 가 서비스 워커에서 실제로 뜨는지, 메시지에 응답하는지 확인한다.
// import 누락 같은 실수는 구문 검사로 안 잡히고 브라우저에서만 터지기 때문에
// chrome API 를 흉내 내어 여기서 미리 태워 본다.

import test from 'node:test';
import assert from 'node:assert/strict';

function installChromeStub(store = {}) {
  const listeners = {};
  const session = {};
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => (listeners.message = fn) },
      onInstalled: { addListener: (fn) => (listeners.installed = fn) },
      onStartup: { addListener: (fn) => (listeners.startup = fn) },
      sendMessage: async () => ({}),
      getURL: (path) => `chrome-extension://test/${path}`,
      lastError: null,
    },
    alarms: {
      get: async () => null,
      create: async () => {},
      onAlarm: { addListener: (fn) => (listeners.alarm = fn) },
    },
    notifications: {
      create: async () => {},
      clear: async () => {},
      getPermissionLevel: async () => 'granted',
      onClicked: { addListener: (fn) => (listeners.notificationClicked = fn) },
      onClosed: { addListener: (fn) => (listeners.notificationClosed = fn) },
    },
    action: { setIcon: async () => {}, setBadgeText: async () => {} },
    windows: { create: () => {} },
    commands: { onCommand: { addListener: (fn) => (listeners.command = fn) } },
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: store[key] };
          return Object.fromEntries(Object.keys(store).map((k) => [k, store[k]]));
        },
        set: async (obj) => Object.assign(store, obj),
        remove: async () => {},
      },
      session: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: session[key] };
          return Object.fromEntries(Object.keys(session).map((k) => [k, session[k]]));
        },
        set: async (obj) => Object.assign(session, obj),
        remove: async () => {},
      },
    },
    cookies: { get: async () => null }, // 로그인되지 않은 상태
    sidePanel: { setPanelBehavior: async () => {} },
    tabs: { create: () => {} },
  };
  return listeners;
}

// ES 모듈은 한 번만 평가되므로 리스너 등록도 한 번뿐이다.
// chrome 스텁만 매번 갈아 끼워 테스트끼리 저장소를 격리한다.
let registered = null;
async function setup(store = {}) {
  const listeners = installChromeStub(store);
  if (!registered) {
    await import('../background.js');
    registered = listeners;
  }
  return registered;
}

const send = (listeners, message) =>
  new Promise((resolve) => listeners.message(message, {}, resolve));

test('background 와 popup 의 BUILD 번호가 일치한다', async () => {
  // 어긋나면 팝업이 멀쩡한 워커를 '예전 버전' 이라고 잘못 안내한다.
  const fs = await import('node:fs');
  const bg = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
  const pop = fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8');

  const bgBuild = bg.match(/const BUILD = (\d+)/)?.[1];
  const popBuild = pop.match(/const EXPECTED_BUILD = (\d+)/)?.[1];

  assert.ok(bgBuild, 'background.js 에 BUILD 상수가 있어야 한다');
  assert.ok(popBuild, 'popup.js 에 EXPECTED_BUILD 상수가 있어야 한다');
  assert.equal(bgBuild, popBuild);
});

test('ping 에 응답한다 (팝업이 워커 버전을 확인하는 통로)', async () => {
  const listeners = await setup();
  const res = await send(listeners, { type: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(typeof res.build, 'number');
});

test('background 가 로드되고 메시지 리스너를 등록한다', async () => {
  const listeners = await setup();
  assert.equal(typeof listeners.message, 'function');
  assert.equal(typeof listeners.command, 'function');
});

test('사번이 없으면 이유가 담긴 응답을 준다 (빈 메시지로 새어 나가지 않는다)', async () => {
  const listeners = await setup();

  for (const message of [{ type: 'getStatus' }, { type: 'getRecords', month: '202608' }]) {
    const res = await send(listeners, message);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no-identity');
    assert.ok(res.message, `${message.type} 응답에 사유가 있어야 한다`);
  }
});

test('진단은 어느 단계에서 막혔는지 알려 준다', async () => {
  const listeners = await setup();

  const res = await send(listeners, { type: 'diagnose' });
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.steps) && res.steps.length >= 2);

  const identityStep = res.steps.find((s) => s.name === '사번 확인');
  const cookieStep = res.steps.find((s) => s.name === '쿠키 읽기');
  assert.equal(identityStep.ok, false);
  assert.equal(cookieStep.ok, false);
  assert.ok(cookieStep.detail.includes('로그인'));
});

test('로그인 전에는 알림 조회가 로그인 필요 사유로 실패한다', async () => {
  const listeners = await setup();
  const res = await send(listeners, { type: 'getAlerts' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'auth');
  assert.ok(res.lastPoll && res.lastPoll.ok === false, '마지막 폴링 결과가 함께 와야 한다');
});

test('알림 폴링은 로그인 전에도 예외 없이 실패 결과를 준다', async () => {
  const listeners = await setup();
  const res = await send(listeners, { type: 'pollAlerts' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'auth');
});
