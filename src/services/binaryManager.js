const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const ffmpegPath = require('ffmpeg-static');
const https = require('https');
const { URL } = require('url');
const YTDlpWrap = require('yt-dlp-wrap').default;


function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function findOnPath(cmd) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const p of paths) {
    for (const ext of exts) {
      const candidate = path.join(p, cmd + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const file = fs.createWriteStream(dest);
    const req = https.get(u, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') ? res.headers.location : `${u.origin}${res.headers.location}`;
        res.resume();
        return download(redirectUrl, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

class BinaryManager {
  constructor() {
    this.ytDlpPath = null;
    this.ytDlpReady = null;
  }

  getFfmpegPath() {
    return ffmpegPath;
  }

  async ensureYtDlp() {
    if (this.ytDlpPath && fs.existsSync(this.ytDlpPath)) return this.ytDlpPath;
    if (!this.ytDlpReady) {
      this.ytDlpReady = (async () => {
        const binDir = path.join(app.getPath('userData'), 'bin');
        ensureDir(binDir);
        const isWin = process.platform === 'win32';
        const fileName = isWin ? 'yt-dlp.exe' : (process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp');
        const targetPath = path.join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');

        if (fs.existsSync(targetPath)) {
          this.ytDlpPath = targetPath;
          return this.ytDlpPath;
        }

        const dlUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
        try {
          await download(dlUrl, targetPath);
          try { fs.chmodSync(targetPath, 0o755); } catch {}
          this.ytDlpPath = targetPath;
          return this.ytDlpPath;
        } catch (e) {}

        try {
          const p = await YTDlpWrap.downloadFromGithub(binDir);
          try { fs.chmodSync(p, 0o755); } catch {}
          this.ytDlpPath = p;
          return this.ytDlpPath;
        } catch (e) {}

        const onPath = findOnPath('yt-dlp');
        if (onPath) {
          this.ytDlpPath = onPath;
          return this.ytDlpPath;
        }

        throw new Error('yt-dlp バイナリを取得できませんでした');
      })();
    }
    return this.ytDlpReady;
  }
}

module.exports = BinaryManager;
