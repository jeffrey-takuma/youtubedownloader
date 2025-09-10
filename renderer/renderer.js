const form = document.getElementById('form');
const urlInput = document.getElementById('url');
const bar = document.getElementById('bar');
const status = document.getElementById('status');
const list = document.getElementById('list');
const player = document.getElementById('player');

let unsubscribe = null;

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function setProgress(p) {
  bar.style.width = `${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%`;
}

ytMusic.onProgress(({ title, progress, downloaded, total }) => {
  setProgress(progress || 0);
  status.innerHTML = `<small>${title} をダウンロード中… ${fmtBytes(downloaded)} / ${fmtBytes(total)}</small>`;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setProgress(0);
  status.innerHTML = '<small>解析中…</small>';
  try {
    const res = await ytMusic.downloadAudio(url);
    setProgress(1);
    status.innerHTML = `<small>保存先: ${res.filePath}</small>`;

    // Set current player
    player.src = res.fileUrl;
    player.play().catch(() => {});

    // Add to list
    const row = document.createElement('div');
    row.className = 'track';
    row.innerHTML = `
      <div class="title">${res.title}</div>
      <div>
        <button class="play">再生</button>
        <a class="open" href="${res.fileUrl}">開く</a>
      </div>
    `;
    row.querySelector('.play').addEventListener('click', () => {
      player.src = res.fileUrl;
      player.play().catch(() => {});
    });
    list.prepend(row);
  } catch (err) {
    console.error(err);
    setProgress(0);
    status.innerHTML = `<small style="color:#b91c1c;">エラー: ${err.message || err}</small>`;
  }
});

