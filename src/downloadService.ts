import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import https from 'https';
import { URL, pathToFileURL } from 'url';
import YTDlpWrap from 'yt-dlp-wrap';
import { DOWNLOAD_AUDIO, DOWNLOAD_PROGRESS } from './common/ipcChannels';

ffmpeg.setFfmpegPath(ffmpegPath as string);

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let ytDlpPath: string | null = null;
let ytDlpReady: Promise<string> | null = null;

function findOnPath(cmd: string): string | null {
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

function download(url: string, dest: string): Promise<void> {
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

async function ensureYtDlp(): Promise<string> {
  if (ytDlpPath && fs.existsSync(ytDlpPath)) return ytDlpPath;
  if (!ytDlpReady) {
    ytDlpReady = (async () => {
      const binDir = path.join(app.getPath('userData'), 'bin');
      ensureDir(binDir);
      const isWin = process.platform === 'win32';
      const fileName = isWin ? 'yt-dlp.exe' : (process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp');
      const targetPath = path.join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');

      if (fs.existsSync(targetPath)) {
        ytDlpPath = targetPath;
        return ytDlpPath;
      }

      const dlUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
      try {
        await download(dlUrl, targetPath);
        try { fs.chmodSync(targetPath, 0o755); } catch {}
        ytDlpPath = targetPath;
        return ytDlpPath;
      } catch (e) {
        // continue
      }

      try {
        const p = await YTDlpWrap.downloadFromGithub(binDir);
        try { fs.chmodSync(p, 0o755); } catch {}
        ytDlpPath = p;
        return ytDlpPath;
      } catch (e) {
        // continue
      }

      const onPath = findOnPath('yt-dlp');
      if (onPath) {
        ytDlpPath = onPath;
        return ytDlpPath;
      }

      throw new Error('yt-dlp バイナリを取得できませんでした');
    })();
  }
  return ytDlpReady;
}

ipcMain.handle(DOWNLOAD_AUDIO, async (event, url: string) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('有効なYouTube URLを入力してください');
    }

    const binPath = await ensureYtDlp();
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

    await new Promise<void>((resolve, reject) => {
      let downloadedBytes = 0;
      let totalBytes = 0;

      const args = [
        url,
        '--no-playlist',
        '-f', 'bestaudio/best',
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '--ffmpeg-location', ffmpegPath as string,
        '-o', finalOutPath
      ];
      const cp = new YTDlpWrap(binPath).exec(args);

      const onLine = (buf: Buffer) => {
        const line = buf.toString();
        const m = /\[download\]\s+(\d+(?:\.\d+)?)%.*?of\s+([\d.]+)\s*([KMG]?i?B)/.exec(line);
        if (m) {
          const pct = parseFloat(m[1]);
          const totalNum = parseFloat(m[2]);
          const unit = m[3];
          const unitMap: Record<string, number> = { B: 1, KB: 1024, KiB: 1024, MB: 1024**2, MiB: 1024**2, GB: 1024**3, GiB: 1024**3 };
          const total = Math.round(totalNum * (unitMap[unit] || 1));
          const downloaded = Math.round((pct / 100) * total);
          totalBytes = total;
          downloadedBytes = downloaded;
          sender?.webContents.send(DOWNLOAD_PROGRESS, {
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
  } catch (err: any) {
    let message = err?.message || String(err);
    if (/ENOENT/.test(message) || /not found/i.test(message)) {
      message = 'yt-dlp が見つかりません。ネットワーク接続を確認し、もう一度お試しください。もしくはシステムに yt-dlp をインストールしてください。';
    }
    throw new Error(`ダウンロードに失敗しました: ${message}`);
  }
});
