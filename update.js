import { savedFolder, verifyInstalledFolder, downloadUpdate, applyFiles } from './lib/folder-update.js';

const choose = document.getElementById('choose');
const install = document.getElementById('install');
const folder = document.getElementById('folder');
const status = document.getElementById('status');
let directory;
let busy = false;
function message(text) { status.textContent = text; }
function controls(value) {
  busy = value;
  choose.disabled = value;
  install.disabled = value || !directory;
}
window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});
choose.addEventListener('click', async () => {
  controls(true);
  try {
    const selected = await window.showDirectoryPicker({ id: 'extension-install', mode: 'readwrite' });
    await verifyInstalledFolder(selected);
    await savedFolder(selected);
    directory = selected;
    folder.textContent = `저장된 폴더: ${directory.name}`;
    message('폴더를 저장했어요. 업데이트 적용을 누르면 최신 릴리스를 설치합니다.');
  } catch (error) {
    message(error.name === 'AbortError' ? '폴더 선택을 취소했어요.' : `폴더를 저장하지 못했어요. ${error.message}`);
  } finally { controls(false); }
});
install.addEventListener('click', async () => {
  controls(true);
  message('폴더 권한과 설치 위치를 확인하는 중…');
  try {
    // Request immediately on click; IndexedDB is already loaded, preserving user activation.
    if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('폴더 쓰기 권한을 허용해 주세요.');
    await navigator.locks.request('gw-worktime-folder-update', { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('다른 탭에서 업데이트 중이에요.');
      await verifyInstalledFolder(directory);
      const update = await downloadUpdate(chrome.runtime.getManifest(), fetch, message);
      await applyFiles(directory, update.files, message);
      message(`v${update.version} 적용 완료. 확장을 다시 로드합니다.`);
      busy = false;
      chrome.runtime.reload();
    });
  } catch (error) { message(error.message); }
  finally { controls(false); }
});
try {
  if (!window.showDirectoryPicker) throw new Error('이 브라우저에서는 폴더 업데이트를 지원하지 않아요.');
  directory = await savedFolder();
  folder.textContent = directory ? `저장된 폴더: ${directory.name}` : '선택한 폴더가 없어요.';
  controls(false);
} catch (error) { folder.textContent = '폴더를 불러오지 못했어요.'; message(error.message); choose.disabled = !window.showDirectoryPicker; }
