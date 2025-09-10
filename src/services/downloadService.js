const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const YTDlpWrap = require('yt-dlp-wrap').default;
const { pathToFileURL } = require('url');
const BinaryManager = require('./binaryManager');

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class DownloadService {
  constructor() {
    this.binaryManager = new BinaryManager();
  }

  async downloadAudio(url, sender) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('有効なYouTube URLを入力してください');
    }

    const binPath = await this.binaryManager.ensureYtDlp();
    const ytdlp = new YTDlpWrap(binPath);
    const rawTitle = (await ytdlp
      .execPromise([url, '--no-playlist', '--print', '%(title)s', '--no-warnings'])
      .catch(() => { throw new Error('yt-dlp failed to get title'); }))
      .trim();
    const title = sanitizeFilename(rawTitle || 'audio');
    const outDir = path.join(app.getPath('music'), 'YouTube Downloads');
    ensureDir(outDir);
    const baseOut = path.join(outDir, `${title}.mp3`);

    let finalOutPath = baseOut;
    let counter = 1;
    while (fs.existsSync(finalOutPath)) {
      finalOutPath = path.join(outDir, `${title} (${counter++}).mp3`);
    }

    await new Promise((resolve, reject) => {
      let downloadedBytes = 0;
      let totalBytes = 0;

      const args = [
        url,
        '--no-playlist',
        '-f', 'bestaudio/best',
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '--ffmpeg-location', this.binaryManager.getFfmpegPath(),
        '-o', finalOutPath
      ];
      const cp = new YTDlpWrap(binPath).exec(args);

      const onLine = (buf) => {
        const line = buf.toString();
        const m = /\[download\]\s+(\d+(?:\.\d+)?)%.*?of\s+([\d.]+)\s*([KMG]?i?B)/.exec(line);
        if (m) {
          const pct = parseFloat(m[1]);
          const totalNum = parseFloat(m[2]);
          const unit = m[3];
          const unitMap = { B: 1, KB: 1024, KiB: 1024, MB: 1024**2, MiB: 1024**2, GB: 1024**3, GiB: 1024**3 };
          const total = Math.round(totalNum * (unitMap[unit] || 1));
          const downloaded = Math.round((pct / 100) * total);
          totalBytes = total;
          downloadedBytes = downloaded;
          sender?.webContents.send('download-progress', {
            title,
            progress: total ? downloaded / total : 0,
            downloaded: downloadedBytes,
            total: totalBytes
          });
        }
      };
      if (cp && cp.stderr && cp.stderr.on) cp.stderr.on('data', onLine);
      if (cp && cp.stdout && cp.stdout.on) cp.stdout.on('data', onLine);

      cp.on('error', reject);
      cp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });

    const fileUrl = pathToFileURL(finalOutPath).toString();
    return {
      title,
      filePath: finalOutPath,
      fileUrl
    };
  }
}

module.exports = DownloadService;
