'use strict';

const SWIPE_DISTANCE = 50;
const TAP_DISTANCE = 10;
const DRIVE_CONTROLS_MS = 5000;
const SLIDE_MS = 280;

const el = {
  stage: document.getElementById('stage'),
  gestures: document.getElementById('gestures'),
  info: document.getElementById('info'),
  title: document.getElementById('title'),
  position: document.getElementById('position'),
  seek: document.getElementById('seek'),
  sound: document.getElementById('sound'),
  message: document.getElementById('message'),
};

let videos = [];
let apiKey = '';
let index = 0;
let slide = null;
let wantsSound = true;
let drag = null;
let passthroughTimer = 0;
let lastWheel = 0;

function driveId(link) {
  const value = String(link || '').trim();
  const match = value.match(/\/(?:file\/(?:u\/\d+\/)?d|d)\/([\w-]{10,})/) || value.match(/[?&]id=([\w-]{10,})/);
  if (match) return match[1];
  return /^[\w-]{20,}$/.test(value) ? value : null;
}

function showMessage(text) {
  el.message.textContent = text;
  el.message.hidden = !text;
}

function mountIframe(target, id) {
  target.replaceChildren();
  const frame = document.createElement('iframe');
  frame.src = `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
  frame.allow = 'autoplay; fullscreen; encrypted-media';
  frame.allowFullscreen = true;
  frame.title = 'Video';
  target.append(frame);
  if (target === slide?.node) {
    slide.video = null;
    el.seek.hidden = true;
    el.sound.hidden = true;
  }
}

function mountVideo(target, id) {
  const video = document.createElement('video');
  video.src = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.addEventListener('error', () => mountIframe(target, id), { once: true });
  video.addEventListener('timeupdate', () => {
    if (slide?.video === video && video.duration) {
      el.seek.value = Math.round((video.currentTime / video.duration) * 1000);
    }
  });
  target.append(video);
  return video;
}

async function play(video) {
  video.muted = !wantsSound;
  try {
    await video.play();
  } catch {
    if (slide?.video !== video) return;
    video.muted = true;
    await video.play().catch(() => {});
  }
  if (slide?.video === video) el.sound.hidden = !video.muted;
}

function setPassthrough(on) {
  clearTimeout(passthroughTimer);
  el.gestures.classList.toggle('passthrough', on);
  if (on) passthroughTimer = setTimeout(() => setPassthrough(false), DRIVE_CONTROLS_MS);
}

function show(nextIndex, dir = { x: 0, y: 0 }) {
  setPassthrough(false);
  index = (nextIndex + videos.length) % videos.length;
  const item = videos[index];
  const node = document.createElement('section');
  node.className = 'slide dragging';
  node.style.transform = `translate(${-dir.x * 100}%, ${-dir.y * 100}%)`;

  const old = slide;
  slide = { node, video: null };
  el.seek.value = 0;
  el.seek.hidden = !apiKey;
  el.sound.hidden = true;
  if (apiKey) slide.video = mountVideo(node, item.id);
  else mountIframe(node, item.id);
  el.stage.append(node);

  el.title.textContent = item.title;
  el.position.textContent = `${index + 1} / ${videos.length}`;
  el.info.hidden = false;

  node.getBoundingClientRect();
  node.classList.remove('dragging');
  node.style.transform = 'translate(0, 0)';

  if (old) {
    old.video?.pause();
    old.node.classList.remove('dragging');
    old.node.style.transform = `translate(${dir.x * 100}%, ${dir.y * 100}%)`;
    setTimeout(() => old.node.remove(), SLIDE_MS + 40);
  }
  if (slide.video) play(slide.video);
}

function move(step, dir) {
  if (videos.length < 2) {
    if (slide) slide.node.style.transform = 'translate(0, 0)';
    return;
  }
  show(index + step, dir);
}

function swipe(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    move(dx < 0 ? 1 : -1, { x: dx < 0 ? -1 : 1, y: 0 });
  } else {
    move(dy < 0 ? 1 : -1, { x: 0, y: dy < 0 ? -1 : 1 });
  }
}

function tap() {
  if (!slide) return;
  if (!slide.video) {
    setPassthrough(true);
    return;
  }
  if (slide.video.paused) play(slide.video);
  else slide.video.pause();
}

el.gestures.addEventListener('pointerdown', (event) => {
  if (!slide) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  el.gestures.setPointerCapture(event.pointerId);
  slide.node.classList.add('dragging');
});

el.gestures.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  slide.node.style.transform = `translate(${horizontal ? dx : 0}px, ${horizontal ? 0 : dy}px)`;
});

function endDrag(event, cancelled) {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag = null;
  slide.node.classList.remove('dragging');
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (!cancelled && distance >= SWIPE_DISTANCE && videos.length > 1) {
    swipe(dx, dy);
    return;
  }
  slide.node.style.transform = 'translate(0, 0)';
  if (!cancelled && distance < TAP_DISTANCE) tap();
}

el.gestures.addEventListener('pointerup', (event) => endDrag(event, false));
el.gestures.addEventListener('pointercancel', (event) => endDrag(event, true));

window.addEventListener('keydown', (event) => {
  const moves = {
    ArrowRight: [1, { x: -1, y: 0 }],
    ArrowDown: [1, { x: 0, y: -1 }],
    ArrowLeft: [-1, { x: 1, y: 0 }],
    ArrowUp: [-1, { x: 0, y: 1 }],
  };
  if (moves[event.key] && event.target !== el.seek) {
    event.preventDefault();
    move(...moves[event.key]);
  } else if (event.key === ' ' && event.target !== el.sound) {
    event.preventDefault();
    tap();
  }
});

window.addEventListener('wheel', (event) => {
  const now = Date.now();
  if (now - lastWheel < 600 || Math.abs(event.deltaY) < 20) return;
  lastWheel = now;
  move(event.deltaY > 0 ? 1 : -1, { x: 0, y: event.deltaY > 0 ? -1 : 1 });
}, { passive: true });

el.seek.addEventListener('input', () => {
  const video = slide?.video;
  if (video?.duration) video.currentTime = (el.seek.value / 1000) * video.duration;
});

el.sound.addEventListener('click', () => {
  wantsSound = true;
  if (slide?.video) {
    slide.video.muted = false;
    el.sound.hidden = true;
  }
});

async function start() {
  try {
    const response = await fetch('videos.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    apiKey = String(data.driveApiKey || '').trim();
    videos = (data.videos || [])
      .map((item, i) => ({ id: driveId(item.link), title: item.title || `Video ${i + 1}` }))
      .filter((item) => item.id);
  } catch {
    showMessage('Could not load videos.json.');
    return;
  }
  if (!videos.length) {
    showMessage('No videos yet. Add Google Drive video links to videos.json.');
    return;
  }
  show(0);
}

start();
