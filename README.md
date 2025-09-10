# YouTube Music Player

Electron app to download YouTube audio and play it back.

## Configuration

Settings are managed via the [config](https://www.npmjs.com/package/config) package. The default configuration is in `config/default.json`:

```json
{
  "outputDir": "YouTube Downloads",
  "audioFormat": "mp3"
}
```

Create `config/local.json` to override these values. `outputDir` accepts either an absolute path or a directory name relative to your Music folder.

