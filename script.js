const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const playbackHint = document.getElementById("playbackHint");
const audio = document.getElementById("audio");
const fileInput = document.getElementById("fileInput");
const trackLabel = document.getElementById("trackName");
const playBtn = document.getElementById("playBtn");
const seek = document.getElementById("seek");
const timeLabel = document.getElementById("time");

const sensitivitySlider = document.getElementById("sensitivity");
const barCountSlider = document.getElementById("barCount");
const smoothingSlider = document.getElementById("smoothing");
const paletteSelect = document.getElementById("palette");
const gradientSlider = document.getElementById("gradient");
const modeSelect = document.getElementById("mode");

const sensitivityLabel = document.getElementById("sensitivityValue");
const barCountLabel = document.getElementById("barCountValue");
const smoothingLabel = document.getElementById("smoothingValue");
const gradientLabel = document.getElementById("gradientValue");

const settings = {
  sensitivity: 1,
  barCount: 64,
  smoothing: 0.8,
  palette: "signal",
  gradient: 0,
  mode: "bars",
};

let audioCtx;
let analyser;
let frequencyData;
let objectUrl;
let bands = [];

function setupAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = settings.smoothing;

  frequencyData = new Float32Array(analyser.frequencyBinCount);

  const source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  buildBands();
}

function buildBands() {
  if (!analyser) return;

  const binHz = audioCtx.sampleRate / analyser.fftSize;
  const lowHz = 40;
  const highHz = Math.min(12000, audioCtx.sampleRate / 2);

  bands = Array.from({ length: settings.barCount }, (_, i) => {
    const low = lowHz * (highHz / lowHz) ** (i / settings.barCount);
    const high = lowHz * (highHz / lowHz) ** ((i + 1) / settings.barCount);
    const center = Math.sqrt(low * high);

    return {
      start: low / binHz,
      end: Math.min(high / binHz, analyser.frequencyBinCount),
      boost: Math.max(-6, Math.min(15, 3 * Math.log2(center / 250))),
    };
  });
}

function getBandLevel(data, band) {
  let power = 0;
  let weight = 0;

  for (let bin = Math.floor(band.start); bin < Math.ceil(band.end); bin++) {
    const overlap = Math.min(bin + 1, band.end) - Math.max(bin, band.start);

    if (overlap <= 0 || bin >= data.length) continue;

    const db = data[bin];
    power += (Number.isFinite(db) ? 10 ** (db / 10) : 0) * overlap;
    weight += overlap;
  }

  if (!weight || !power) return 0;

  const db = 10 * Math.log10(power / weight);

  if (db <= -85) return 0;

  const normalized = Math.max(
    0,
    Math.min(1, (db + band.boost + 85) / 60)
  );

  const gate = Math.min(1, (db + 85) / 10);

  return Math.min(
    1,
    normalized ** 0.85 * gate * settings.sensitivity
  );
}

async function startPlayback() {
  const requestedSource = audio.src;

  try {
    setupAudio();

    const resume = audioCtx.resume();
    const play = audio.play();

    await Promise.all([resume, play]);
  } catch (error) {
    if (error.name !== "AbortError" && audio.src === requestedSource) {
      playbackHint.textContent = "UNABLE TO PLAY — TRY ANOTHER AUDIO FILE";
    }
  }
}

function togglePlayback() {
  if (playBtn.disabled) return;

  if (audio.paused) {
    startPlayback();
  } else {
    audio.pause();
  }
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) return;

  audio.pause();

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;
  trackLabel.textContent = file.name;

  playBtn.disabled = true;
  seek.disabled = true;
  seek.value = 0;
  timeLabel.textContent = "00:00 / 00:00";

  stage.setAttribute("aria-disabled", "true");
  document.body.classList.add("loaded");
  playbackHint.textContent = "LOADING TRACK";

  startPlayback();
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);

  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function syncTime() {
  seek.value = audio.currentTime;

  timeLabel.textContent =
    formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
}

function syncTransport() {
  playBtn.textContent = audio.paused ? "PLAY" : "PAUSE";

  document.body.classList.toggle("playing", !audio.paused);

  stage.setAttribute(
    "aria-label",
    audio.paused ? "Play track" : "Pause track"
  );

  playbackHint.textContent = audio.paused
    ? "CLICK OR SPACE TO PLAY"
    : "CLICK OR SPACE TO PAUSE";
}

audio.addEventListener("loadedmetadata", () => {
  seek.max = Number.isFinite(audio.duration) ? audio.duration : 0;
  seek.disabled = !Number.isFinite(audio.duration);
  playBtn.disabled = false;

  stage.setAttribute("aria-disabled", "false");

  syncTime();
  syncTransport();
});

audio.addEventListener("play", syncTransport);
audio.addEventListener("pause", syncTransport);
audio.addEventListener("ended", syncTransport);
audio.addEventListener("timeupdate", syncTime);

audio.addEventListener("error", () => {
  playBtn.disabled = true;
  seek.disabled = true;

  stage.setAttribute("aria-disabled", "true");
  stage.setAttribute("aria-label", "Unable to play track");

  document.body.classList.remove("playing");
  playbackHint.textContent = "UNABLE TO PLAY — TRY ANOTHER AUDIO FILE";
});

playBtn.addEventListener("click", togglePlayback);
stage.addEventListener("click", togglePlayback);

document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }

  if (
    event.target.closest(
      'input:not([type="range"]), select, textarea, button, a'
    ) ||
    event.target.isContentEditable
  ) {
    return;
  }

  event.preventDefault();

  if (!event.repeat) {
    togglePlayback();
  }
});

stage.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();

    if (!event.repeat) {
      togglePlayback();
    }
  }
});

seek.addEventListener("input", () => {
  audio.currentTime = Number(seek.value);
  syncTime();
});

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const palettes = {
  signal: [0, 40],
  acid: [60, 130],
  ice: [170, 220],
  spectrum: [0, 300],
};

function getHue(i, count) {
  const [start, end] = palettes[settings.palette];

  return (
    start +
    (end - start) * (i / Math.max(1, count - 1)) +
    settings.gradient
  ) % 360;
}

function updateAccent(time) {
  const [start, end] = palettes[settings.palette];

  const base = settings.palette === "spectrum"
    ? time / 40
    : (start + end) / 2;

  const hue = (base + settings.gradient) % 360;

  document.documentElement.style.setProperty(
    "--accent",
    `hsl(${hue}, 100%, 50%)`
  );
}

function traceWave(points) {
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const middle = (current.x + next.x) / 2;

    ctx.bezierCurveTo(
      middle, current.y,
      middle, next.y,
      next.x, next.y
    );
  }
}

function drawOcean(levels) {
  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;

  const smooth = levels.map((_, i) => {
    let total = 0;
    let weights = 0;

    for (let offset = -3; offset <= 3; offset++) {
      const index = Math.max(
        0,
        Math.min(levels.length - 1, i + offset)
      );

      const weight = 4 - Math.abs(offset);
      total += levels[index] * weight;
      weights += weight;
    }

    return total / weights;
  });

  const gradient = ctx.createLinearGradient(0, 0, width, 0);

  for (let i = 0; i <= 8; i++) {
    gradient.addColorStop(
      i / 8,
      `hsl(${getHue(i, 9)}, 90%, 60%)`
    );
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.shadowColor = `hsl(${getHue(1, 3)}, 90%, 60%)`;

  for (let layer = 0; layer < 3; layer++) {
    const scale = 1 - layer * 0.22;
    const upper = [];
    const lower = [];

    for (let i = 0; i <= 128; i++) {
      const position = i / 128;
      const index =
        Math.abs(position * 2 - 1) * (smooth.length - 1);

      const left = Math.floor(index);
      const fraction = index - left;

      const level =
        smooth[left] * (1 - fraction) +
        smooth[Math.min(left + 1, smooth.length - 1)] * fraction;

      const taper = Math.sin(Math.PI * position) ** 0.6;
      const amplitude = level * height * 0.42 * taper * scale;

      upper.push({
        x: position * width,
        y: centerY - amplitude,
      });

      lower.push({
        x: position * width,
        y: centerY + amplitude,
      });
    }

    ctx.beginPath();
    traceWave(upper);

    const reversed = lower.reverse();
    ctx.lineTo(reversed[0].x, reversed[0].y);

    for (let i = 0; i < reversed.length - 1; i++) {
      const current = reversed[i];
      const next = reversed[i + 1];
      const middle = (current.x + next.x) / 2;

      ctx.bezierCurveTo(
        middle, current.y,
        middle, next.y,
        next.x, next.y
      );
    }

    ctx.closePath();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.12;
    ctx.fill();

    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.85 - layer * 0.2;
    ctx.stroke();
  }

  ctx.restore();
}

function draw() {
  analyser.getFloatFrequencyData(frequencyData);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const levels = bands.map(band =>
    getBandLevel(frequencyData, band)
  );

  if (settings.mode === "ocean") {
    drawOcean(levels);
    return;
  }

  const barWidth = canvas.width / settings.barCount;

  levels.forEach((level, i) => {
    const barHeight = level * canvas.height;

    ctx.fillStyle =
      `hsl(${getHue(i, settings.barCount)}, 90%, 60%)`;

    ctx.fillRect(
      i * barWidth,
      canvas.height - barHeight,
      Math.max(1, barWidth - 2),
      barHeight
    );
  });
}

modeSelect.addEventListener("change", () => {
  settings.mode = modeSelect.value;
});

sensitivitySlider.addEventListener("input", () => {
  settings.sensitivity = Number(sensitivitySlider.value);
  sensitivityLabel.textContent = settings.sensitivity.toFixed(1);
});

barCountSlider.addEventListener("input", () => {
  settings.barCount = Number(barCountSlider.value);
  barCountLabel.textContent = settings.barCount;
  buildBands();
});

smoothingSlider.addEventListener("input", () => {
  settings.smoothing = Number(smoothingSlider.value);
  smoothingLabel.textContent = settings.smoothing.toFixed(2);

  if (analyser) {
    analyser.smoothingTimeConstant = settings.smoothing;
  }
});

paletteSelect.addEventListener("change", () => {
  settings.palette = paletteSelect.value;
});

gradientSlider.addEventListener("input", () => {
  settings.gradient = Number(gradientSlider.value);
  gradientLabel.textContent = settings.gradient + "°";
});

function animate(time = 0) {
  requestAnimationFrame(animate);
  updateAccent(time);

  if (analyser) {
    draw();
  }
}

animate();

const overlayControls = [
  ...document.querySelectorAll(".bar, .panel, .transport")
];

let controlsTimer;
let draggingControl = false;
let keyboardControls = false;

function showControls() {
  clearTimeout(controlsTimer);

  document.body.classList.remove("ui-hidden");

  overlayControls.forEach(control => {
    control.inert = false;
  });

  if (
    !audio.paused &&
    !audio.ended &&
    !draggingControl &&
    !keyboardControls
  ) {
    controlsTimer = setTimeout(() => {
      document.body.classList.add("ui-hidden");

      overlayControls.forEach(control => {
        control.inert = true;
      });
    }, 2500);
  }
}

document.addEventListener("pointermove", () => {
  keyboardControls = false;
  showControls();
});

document.addEventListener("pointerdown", (event) => {
  keyboardControls = false;

  draggingControl = Boolean(
    event.target.closest(".bar, .panel, .transport")
  );

  showControls();
});

function releaseControls() {
  draggingControl = false;
  showControls();
}

window.addEventListener("pointerup", releaseControls);
window.addEventListener("pointercancel", releaseControls);
window.addEventListener("blur", releaseControls);

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    keyboardControls = true;
  }

  showControls();
}, true);

overlayControls.forEach(control => {
  control.addEventListener("input", showControls);
  control.addEventListener("change", showControls);
  control.addEventListener("wheel", showControls, {
    passive: true
  });
});

audio.addEventListener("play", showControls);
audio.addEventListener("pause", showControls);
audio.addEventListener("ended", showControls);
audio.addEventListener("error", showControls);

showControls();

stage.removeAttribute("title");