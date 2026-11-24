// ============ DOM ============
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const tiktokUrl = document.getElementById('tiktokUrl');
const fetchTikTokBtn = document.getElementById('fetchTikTokBtn');
const videoEl = document.getElementById('videoEl');
const asciiOutput = document.getElementById('asciiOutput');
const previewEmpty = document.getElementById('previewEmpty');
const statusEl = document.getElementById('statusEl');
const frameSlider = document.getElementById('frameSlider');
const frameInfo = document.getElementById('frameInfo');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const renderBtn = document.getElementById('renderBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const downloadPyBtn = document.getElementById('downloadPyBtn');
const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const widthSlider = document.getElementById('widthSlider');
const fpsSlider = document.getElementById('fpsSlider');
const widthVal = document.getElementById('widthVal');
const fpsVal = document.getElementById('fpsVal');
const charsetSelect = document.getElementById('charset');

// ============ STATE ============
let frames = [];         // массив { ascii, color? }
let playTimer = null;
let currentFrame = 0;
let videoLoaded = false;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// ============ TABS ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ============ DRAG & DROP ============
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) loadFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadFile(file);
});

// ============ ЗАГРУЗКА ФАЙЛА ============
function loadFile(file) {
  resetState();
  statusEl.textContent = 'Загрузка файла…';
  previewEmpty.classList.add('hidden');
  const url = URL.createObjectURL(file);
  videoEl.src = url;
  videoEl.onloadedmetadata = () => {
    videoLoaded = true;
    renderBtn.disabled = false;
    statusEl.textContent = `Готово: ${file.name} · ${videoEl.duration.toFixed(1)} сек`;
    URL.revokeObjectURL(url);
  };
  videoEl.onerror = () => {
    statusEl.textContent = '❌ Не удалось прочитать видео';
  };
}

// ============ TIKTOK ============
fetchTikTokBtn.addEventListener('click', async () => {
  const url = tiktokUrl.value.trim();
  if (!url) return alert('Вставь ссылку TikTok');

  resetState();
  statusEl.textContent = 'Получаю видео с TikTok…';
  previewEmpty.classList.add('hidden');

  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('API недоступен');
    const json = await res.json();
    if (json.code !== 0 || !json.data?.play) throw new Error('Не удалось получить видео');

    const videoUrl = json.data.play.startsWith('http')
      ? json.data.play
      : 'https://www.tikwm.com' + json.data.play;

    statusEl.textContent = 'Загружаю видео…';
    const videoRes = await fetch(videoUrl);
    const blob = await videoRes.blob();
    const blobUrl = URL.createObjectURL(blob);

    videoEl.src = blobUrl;
    videoEl.onloadedmetadata = () => {
      videoLoaded = true;
      renderBtn.disabled = false;
      statusEl.textContent = `TikTok · ${videoEl.duration.toFixed(1)} сек`;
      URL.revokeObjectURL(blobUrl);
    };
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
    previewEmpty.classList.remove('hidden');
  }
});

// ============ СБРОС ============
function resetState() {
  stopPlayback();
  frames = [];
  currentFrame = 0;
  videoLoaded = false;
  asciiOutput.textContent = '';
  previewEmpty.classList.remove('hidden');
  frameSlider.disabled = true;
  frameSlider.max = 0;
  frameSlider.value = 0;
  frameInfo.textContent = 'Кадр 0 / 0';
  playBtn.disabled = true;
  pauseBtn.disabled = true;
  renderBtn.disabled = true;
  downloadTxtBtn.disabled = true;
  downloadPyBtn.disabled = true;
  downloadHtmlBtn.disabled = true;
}

// ============ РЕНДЕР ============
renderBtn.addEventListener('click', async () => {
  if (!videoLoaded) return;
  resetState();
  previewEmpty.classList.add('hidden');
  videoLoaded = true;
  renderBtn.disabled = true;

  const width = parseInt(widthSlider.value);
  const fps = parseInt(fpsSlider.value);
  const chars = charsetSelect.value;
  const duration = videoEl.duration;
  const totalFrames = Math.min(Math.floor(duration * fps), 400);

  for (let i = 0; i < totalFrames; i++) {
    const time = i / fps;
    await seekTo(time);
    const ascii = frameToAscii(videoEl, width, chars);
    frames.push(ascii);

    if (i % 5 === 0) {
      statusEl.textContent = `Рендер… ${i + 1}/${totalFrames}`;
      asciiOutput.textContent = ascii;
    }
  }

  statusEl.textContent = `✅ ${frames.length} кадров · ${width}×${Math.round(width * (videoEl.videoHeight/videoEl.videoWidth) * 0.5)}`;
  frameSlider.max = frames.length - 1;
  frameSlider.value = 0;
  frameSlider.disabled = false;
  currentFrame = 0;
  showFrame(0);
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  downloadTxtBtn.disabled = false;
  downloadPyBtn.disabled = false;
  downloadHtmlBtn.disabled = false;
  renderBtn.disabled = false;
});

function seekTo(time) {
  return new Promise(resolve => {
    videoEl.currentTime = time;
    videoEl.onseeked = () => resolve();
  });
}

function frameToAscii(video, width, chars) {
  const aspect = video.videoHeight / video.videoWidth;
  const height = Math.max(1, Math.floor(width * aspect * 0.5));
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(video, 0, 0, width, height);

  const data = ctx.getImageData(0, 0, width, height).data;
  const n = chars.length;
  let result = '';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      const idx = Math.min(Math.floor(lum / 256 * n), n - 1);
      result += chars[idx];
    }
    result += '\n';
  }
  return result;
}

// ============ ЦВЕТ ============
document.querySelectorAll('input[name="color"]').forEach(r => {
  r.addEventListener('change', () => {
    asciiOutput.classList.remove('color-white', 'color-amber');
    if (r.value === 'white') asciiOutput.classList.add('color-white');
    if (r.value === 'amber') asciiOutput.classList.add('color-amber');
  });
});

// ============ SLIDER КАДРОВ ============
frameSlider.addEventListener('input', () => {
  showFrame(parseInt(frameSlider.value));
});

function showFrame(idx) {
  if (frames.length === 0) return;
  currentFrame = idx;
  asciiOutput.textContent = frames[idx];
  frameInfo.textContent = `Кадр ${idx + 1} / ${frames.length}`;
}

// ============ PLAY / PAUSE ============
playBtn.addEventListener('click', () => {
  if (frames.length === 0) return;
  stopPlayback();
  const fps = parseInt(fpsSlider.value);
  const delay = 1000 / fps;

  playTimer = setInterval(() => {
    currentFrame = (currentFrame + 1) % frames.length;
    showFrame(currentFrame);
    frameSlider.value = currentFrame;
  }, delay);

  playBtn.disabled = true;
  pauseBtn.disabled = false;
  statusEl.textContent = '▶ Воспроизведение';
});

pauseBtn.addEventListener('click', () => {
  stopPlayback();
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  statusEl.textContent = '⏸ Пауза';
});

function stopPlayback() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

// ============ СКАЧИВАНИЕ ============
downloadTxtBtn.addEventListener('click', () => {
  if (frames.length === 0) return;
  const sep = '\n\n--- FRAME ---\n\n';
  downloadFile(frames.join(sep), 'ascii_video.txt', 'text/plain');
});

downloadPyBtn.addEventListener('click', () => {
  if (frames.length === 0) return;
  const fps = parseInt(fpsSlider.value);
  const escaped = frames.map(f => f.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  let script = `#!/usr/bin/env python3
# ASCII-видео (ASCII Studio)
# Запуск: python ascii_video.py
import sys, time, os

FPS = ${fps}
FRAMES = [
`;
  escaped.forEach(f => script += `    '''${f}''',\n`);
  script += `]

def main():
    os.system("cls" if os.name == "nt" else "clear")
    sys.stdout.write("\\033[?25l")
    sys.stdout.flush()
    delay = 1.0 / FPS
    try:
        for frame in FRAMES:
            sys.stdout.write("\\033[H" + frame + "\\033[J")
            sys.stdout.flush()
            time.sleep(delay)
    except KeyboardInterrupt:
        pass
    finally:
        sys.stdout.write("\\033[?25h")
        sys.stdout.flush()
        print()

if __name__ == "__main__":
    main()
`;
  downloadFile(script, 'ascii_video.py', 'text/x-python');
});

downloadHtmlBtn.addEventListener('click', () => {
  if (frames.length === 0) return;
  const fps = parseInt(fpsSlider.value);
  const framesJson = JSON.stringify(frames);
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ASCII Video</title>
<style>
body{background:#000;color:#00ff88;font-family:'Courier New',monospace;margin:0;padding:20px;}
pre{font-size:10px;line-height:10px;white-space:pre;text-shadow:0 0 4px currentColor;}
.controls{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111;padding:10px 20px;border-radius:10px;border:1px solid #333;}
button{background:#00ff88;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;font-family:inherit;}
</style></head><body>
<pre id="out"></pre>
<div class="controls"><button id="toggle">▶ Play</button></div>
<script>
const frames = ${framesJson};
const fps = ${fps};
const out = document.getElementById('out');
const btn = document.getElementById('toggle');
let idx = 0, timer = null;
function show(i){out.textContent = frames[i];}
show(0);
btn.onclick = () => {
  if (timer) { clearInterval(timer); timer = null; btn.textContent = '▶ Play'; }
  else {
    timer = setInterval(() => { idx = (idx + 1) % frames.length; show(idx); }, 1000 / fps);
    btn.textContent = '⏸ Pause';
  }
};
</script>
</body></html>`;
  downloadFile(html, 'ascii_video.html', 'text/html');
});

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ ИНИЦИАЛИЗАЦИЯ ============
widthSlider.addEventListener('input', () => widthVal.textContent = widthSlider.value);
fpsSlider.addEventListener('input', () => fpsVal.textContent = fpsSlider.value);
resetState();