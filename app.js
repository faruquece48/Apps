'use strict';

const CONTROLS_MS = 3000;
const TITLES = { home: 'Home', image: 'Images', videos: 'Videos', reels: 'Reels', favourite: 'Favourite', login: 'Login', watch: 'Videos' };
const LANDSCAPE_VIEWS = new Set(['videos', 'watch']);

const $ = (id) => document.getElementById(id);
const el = {
  title: $('page-title'),
  searchToggle: $('search-toggle'),
  searchRow: $('search-row'),
  search: $('search'),
  chips: $('chips'),
  content: $('content'),
  tabs: $('tabs'),
  message: $('message'),
  player: $('player'),
  video: $('p-video'),
  fav: $('p-fav'),
  sound: $('p-sound'),
  toggle: $('p-toggle'),
  seek: $('p-seek'),
  cur: $('p-cur'),
  dur: $('p-dur'),
  full: $('p-full'),
  homeSlot: $('home-slot'),
  watchSlot: $('watch-slot'),
  homeGrid: $('home-grid'),
  imageGrid: $('image-grid'),
  videosGrid: $('videos-grid'),
  favouriteGrid: $('favourite-grid'),
  watchGrid: $('watch-grid'),
  watchTitle: $('watch-title'),
  reels: $('view-reels'),
  lightbox: $('lightbox'),
  lightboxImg: $('lightbox-img'),
};

const favourites = readSet('saved');
const durations = new Map();
let allVideos = [];
let allImages = [];
let apiKey = '';
let view = 'home';
let category = 'all';
let query = '';
let current = null;
let wantsSound = true;
let controlsTimer = 0;
let messageTimer = 0;
let activeReel = null;
let reelObserver = null;

function driveId(link) {
  const value = String(link || '').trim();
  const match = value.match(/\/(?:file\/(?:u\/\d+\/)?d|d)\/([\w-]{10,})/) || value.match(/[?&]id=([\w-]{10,})/);
  if (match) return match[1];
  return /^[\w-]{20,}$/.test(value) ? value : null;
}

function readSet(name) {
  try {
    return new Set(JSON.parse(localStorage.getItem(name)) || []);
  } catch {
    return new Set();
  }
}

function writeSet(name, set) {
  try {
    localStorage.setItem(name, JSON.stringify([...set]));
  } catch {
    // Storage unavailable: the choice still lasts for this session.
  }
}

function showMessage(text, ms = 3000) {
  clearTimeout(messageTimer);
  el.message.textContent = text;
  el.message.hidden = !text;
  if (text) messageTimer = setTimeout(() => showMessage(''), ms);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function sourceOf(item) {
  if (item.url) return item.url;
  if (apiKey) return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  return '';
}

function matchesFilters(item) {
  return (category === 'all' || item.category === category)
    && (!query || item.title.toLowerCase().includes(query));
}

function matches(item) {
  return !item.reel && matchesFilters(item);
}

function toggleFavourite(id) {
  if (favourites.has(id)) favourites.delete(id);
  else favourites.add(id);
  writeSet('saved', favourites);
  syncFavourite();
  document.querySelectorAll(`.reel[data-id="${CSS.escape(id)}"] .fav`).forEach((button) => {
    button.setAttribute('aria-pressed', String(favourites.has(id)));
  });
  if (view === 'favourite') renderGrids();
}

function syncFavourite() {
  const on = Boolean(current && favourites.has(current.id));
  el.fav.setAttribute('aria-pressed', String(on));
  el.fav.setAttribute('aria-label', on ? 'Remove from Favourite' : 'Add to Favourite');
}

/* Cards */

const cardObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      cardObserver.unobserve(entry.target);
      fillCard(entry.target);
    });
  }, { rootMargin: '200px' })
  : null;

function fillCard(card) {
  const item = allVideos.find((video) => video.id === card.dataset.id);
  const src = item && sourceOf(item);
  if (!src) return;
  const known = durations.get(item.id);
  if (item.thumb && known) return;
  const probe = document.createElement('video');
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = 'metadata';
  probe.src = `${src}#t=0.5`;
  probe.addEventListener('loadedmetadata', () => {
    durations.set(item.id, probe.duration);
    card.querySelector('.dur').textContent = formatTime(probe.duration);
  }, { once: true });
  if (!item.thumb) card.prepend(probe);
}

function videoCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.id = item.id;
  card.setAttribute('aria-label', `Play ${item.title}`);
  if (item.thumb) {
    const image = document.createElement('img');
    image.src = item.thumb;
    image.alt = '';
    image.loading = 'lazy';
    card.append(image);
  }
  const play = document.createElement('span');
  play.className = 'play';
  play.innerHTML = '<svg><use href="#i-play"/></svg>';
  const duration = document.createElement('span');
  duration.className = 'dur';
  if (durations.has(item.id)) duration.textContent = formatTime(durations.get(item.id));
  card.append(play, duration);
  card.addEventListener('click', () => openVideo(item));
  if (cardObserver) cardObserver.observe(card);
  else fillCard(card);
  return card;
}

function fillGrid(grid, list, emptyText) {
  grid.replaceChildren(...(list.length ? list.map(videoCard) : [emptyNode(emptyText)]));
}

function emptyNode(text) {
  const node = document.createElement('p');
  node.className = 'empty';
  node.textContent = text;
  return node;
}

function renderGrids() {
  const list = allVideos.filter(matches);
  const noneText = query ? 'No videos found.' : 'No videos in this category yet.';
  if (view === 'home') {
    const rest = list.filter((item) => item.id !== current?.id);
    fillGrid(el.homeGrid, rest, list.length ? 'More videos coming soon.' : noneText);
  } else if (view === 'videos') {
    fillGrid(el.videosGrid, list, noneText);
  } else if (view === 'favourite') {
    fillGrid(el.favouriteGrid, allVideos.filter((item) => favourites.has(item.id) && matchesFilters(item)),
      query ? 'No videos found.' : 'Tap the heart on a video to save it here.');
  } else if (view === 'watch') {
    fillGrid(el.watchGrid, allVideos.filter((item) => !item.reel && item.id !== current?.id), 'More videos coming soon.');
  } else if (view === 'image') {
    renderImages();
  }
}

function renderImages() {
  const list = allImages.filter((item) => !query || item.title.toLowerCase().includes(query));
  if (!list.length) {
    el.imageGrid.replaceChildren(emptyNode(query ? 'No images found.' : 'No images yet.'));
    return;
  }
  el.imageGrid.replaceChildren(...list.map((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card photo';
    card.setAttribute('aria-label', `Open ${item.title}`);
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = item.title;
    image.loading = 'lazy';
    card.append(image);
    card.addEventListener('click', () => {
      el.lightboxImg.src = item.url;
      el.lightboxImg.alt = item.title;
      el.lightbox.hidden = false;
    });
    return card;
  }));
}

/* Main player */

function loadPlayer(item) {
  if (current?.id === item.id && (el.video.getAttribute('src') || el.player.querySelector('iframe'))) {
    syncFavourite();
    return;
  }
  current = item;
  el.player.querySelector('iframe')?.remove();
  el.seek.value = 0;
  el.seek.style.setProperty('--p', '0%');
  el.cur.textContent = '0:00';
  el.dur.textContent = '0:00';
  el.video.poster = item.thumb || '';
  const src = sourceOf(item);
  el.player.classList.toggle('embed', !src);
  el.video.hidden = !src;
  if (src) {
    el.video.src = src;
  } else {
    el.video.removeAttribute('src');
    el.video.load();
    const frame = document.createElement('iframe');
    frame.src = `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/preview`;
    frame.allow = 'autoplay; fullscreen; encrypted-media';
    frame.allowFullscreen = true;
    frame.title = item.title;
    el.player.prepend(frame);
  }
  syncFavourite();
}

async function playWithSound(video, onDone) {
  video.muted = !wantsSound;
  try {
    await video.play();
  } catch (error) {
    if (error.name !== 'AbortError') {
      // Browsers block autoplay with sound until the first tap.
      video.muted = true;
      await video.play().catch(() => {});
    }
  }
  onDone?.();
}

function startPlayer() {
  if (!current || !el.video.getAttribute('src')) return;
  playWithSound(el.video, syncSound);
}

function syncSound() {
  el.sound.hidden = !(el.video.muted && wantsSound);
}

function revealControls() {
  clearTimeout(controlsTimer);
  el.player.classList.remove('idle');
  if (!el.video.paused) {
    controlsTimer = setTimeout(() => el.player.classList.add('idle'), CONTROLS_MS);
  }
}

function openVideo(item) {
  if (view === 'home') {
    loadPlayer(item);
    el.content.scrollTo({ top: 0, behavior: 'smooth' });
    renderGrids();
    startPlayer();
    revealControls();
    return;
  }
  loadPlayer(item);
  setView('watch');
}

el.video.addEventListener('click', () => {
  if (el.video.muted && wantsSound) {
    el.video.muted = false;
    syncSound();
  }
  if (el.player.classList.contains('idle')) {
    revealControls();
  } else if (!el.video.paused) {
    clearTimeout(controlsTimer);
    el.player.classList.add('idle');
  }
});

el.video.addEventListener('play', () => {
  el.player.classList.remove('paused');
  el.toggle.setAttribute('aria-label', 'Pause');
  revealControls();
});

el.video.addEventListener('pause', () => {
  el.player.classList.add('paused');
  el.toggle.setAttribute('aria-label', 'Play');
  revealControls();
});

el.video.addEventListener('loadedmetadata', () => {
  el.dur.textContent = formatTime(el.video.duration);
  if (current) durations.set(current.id, el.video.duration);
});

el.video.addEventListener('timeupdate', () => {
  if (!el.video.duration) return;
  const ratio = el.video.currentTime / el.video.duration;
  el.seek.value = Math.round(ratio * 1000);
  el.seek.style.setProperty('--p', `${ratio * 100}%`);
  el.cur.textContent = formatTime(el.video.currentTime);
});

el.video.addEventListener('error', () => {
  if (el.video.getAttribute('src')) showMessage('This video could not be played.');
});

el.seek.addEventListener('input', () => {
  if (el.video.duration) el.video.currentTime = (el.seek.value / 1000) * el.video.duration;
  el.seek.style.setProperty('--p', `${el.seek.value / 10}%`);
  revealControls();
});

el.toggle.addEventListener('click', () => {
  if (el.video.paused) startPlayer();
  else el.video.pause();
});

el.sound.addEventListener('click', () => {
  el.video.muted = false;
  syncSound();
});

el.fav.addEventListener('click', () => {
  if (current) toggleFavourite(current.id);
});

el.full.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {});
  } else if (el.player.requestFullscreen) {
    await el.player.requestFullscreen().catch(() => {});
  } else if (el.video.webkitEnterFullscreen) {
    el.video.webkitEnterFullscreen();
  }
});

document.addEventListener('fullscreenchange', applyOrientation);

function applyOrientation() {
  const orientation = screen.orientation;
  if (!orientation?.lock) return;
  if (document.fullscreenElement) {
    if (el.video.videoWidth >= el.video.videoHeight) orientation.lock('landscape').catch(() => {});
  } else if (LANDSCAPE_VIEWS.has(view)) {
    orientation.unlock?.();
  } else {
    orientation.lock('portrait').catch(() => {});
  }
}

/* Reels */

function buildReels() {
  reelObserver?.disconnect();
  activeReel = null;
  const tagged = allVideos.filter((item) => item.reel && sourceOf(item));
  const list = tagged.length ? tagged : allVideos.filter(sourceOf);
  if (!list.length) {
    el.reels.replaceChildren(emptyNode('No reels yet.'));
    return;
  }
  el.reels.replaceChildren(...list.map(reelNode));
  reelObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activateReel(entry.target);
    });
  }, { root: el.reels, threshold: 0.6 });
  el.reels.querySelectorAll('.reel').forEach((node) => reelObserver.observe(node));
}

function reelNode(item) {
  const node = document.createElement('article');
  node.className = 'reel';
  node.dataset.id = item.id;

  const video = document.createElement('video');
  video.playsInline = true;
  video.loop = true;
  video.preload = 'none';
  if (item.thumb) video.poster = item.thumb;
  video.addEventListener('loadedmetadata', () => {
    video.classList.toggle('wide', video.videoWidth > video.videoHeight);
  });
  video.addEventListener('play', () => node.classList.remove('paused'));
  video.addEventListener('pause', () => node.classList.add('paused'));
  video.addEventListener('click', () => {
    if (video.muted && wantsSound) video.muted = false;
    else if (video.paused) playWithSound(video);
    else video.pause();
  });

  const icon = document.createElement('span');
  icon.className = 'round paused-icon';
  icon.innerHTML = '<svg><use href="#i-play"/></svg>';

  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'round fav';
  fav.setAttribute('aria-label', 'Favourite');
  fav.setAttribute('aria-pressed', String(favourites.has(item.id)));
  fav.innerHTML = '<svg><use href="#i-heart"/></svg>';
  fav.addEventListener('click', () => toggleFavourite(item.id));

  const title = document.createElement('h3');
  title.textContent = item.title;

  node.append(video, icon, fav, title);
  return node;
}

function activateReel(node) {
  if (view !== 'reels' || activeReel === node) return;
  stopReel();
  activeReel = node;
  const item = allVideos.find((video) => video.id === node.dataset.id);
  const video = node.querySelector('video');
  video.src = sourceOf(item);
  playWithSound(video);
}

function stopReel() {
  if (!activeReel) return;
  const video = activeReel.querySelector('video');
  video.pause();
  // Stop the download of the reel that was swiped away.
  video.removeAttribute('src');
  video.load();
  activeReel.classList.remove('paused');
  activeReel = null;
}

/* Navigation */

function setView(next) {
  const previous = view;
  if (previous === 'reels' && next !== 'reels') stopReel();
  view = next;
  document.body.dataset.view = next;
  el.title.textContent = TITLES[next];
  document.querySelectorAll('#content > .view').forEach((section) => {
    section.hidden = section.id !== `view-${next}`;
  });
  const activeTab = next === 'watch' ? 'videos' : next;
  el.tabs.querySelectorAll('button').forEach((button) => {
    const on = button.dataset.view === activeTab;
    button.classList.toggle('active', on);
    if (on) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  el.content.scrollTop = 0;

  if (next === 'home' || next === 'watch') {
    const slot = next === 'home' ? el.homeSlot : el.watchSlot;
    if (el.player.parentElement !== slot) slot.append(el.player);
    if (next === 'home' && !current) {
      const first = allVideos.find(matches) || allVideos[0];
      if (first) loadPlayer(first);
    }
    if (next === 'watch') el.watchTitle.textContent = current?.title || '';
    startPlayer();
  } else {
    el.video.pause();
  }

  if (next === 'reels') buildReels();
  renderGrids();
  applyOrientation();
}

el.tabs.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) setView(button.dataset.view);
});

$('see-all').addEventListener('click', () => setView('videos'));
$('back').addEventListener('click', () => setView('videos'));

el.chips.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-cat]');
  if (!button) return;
  category = button.dataset.cat;
  el.chips.querySelectorAll('button').forEach((chip) => {
    const on = chip === button;
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', String(on));
  });
  if (view === 'home') {
    const first = allVideos.find(matches);
    if (first && !(current && matches(current))) {
      loadPlayer(first);
      startPlayer();
    }
  }
  renderGrids();
});

el.searchToggle.addEventListener('click', () => {
  const open = el.searchRow.hidden;
  el.searchRow.hidden = !open;
  el.searchToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    el.search.focus();
  } else {
    el.search.value = '';
    query = '';
    renderGrids();
  }
});

el.search.addEventListener('input', () => {
  query = el.search.value.trim().toLowerCase();
  if (view === 'reels' || view === 'login' || view === 'watch') setView('videos');
  else renderGrids();
});

function closeLightbox() {
  el.lightbox.hidden = true;
  el.lightboxImg.removeAttribute('src');
}

$('lightbox-close').addEventListener('click', closeLightbox);
el.lightbox.addEventListener('click', (event) => {
  if (event.target === el.lightbox) closeLightbox();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.lightbox.hidden) closeLightbox();
});

async function start() {
  try {
    const response = await fetch('videos.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    apiKey = String(data.driveApiKey || '').trim();
    allVideos = (data.videos || [])
      .map((item, i) => {
        const id = item.url ? decodeURIComponent(item.url.split('/').pop()).replace(/\.\w+$/, '') : driveId(item.link);
        return {
          id,
          url: item.url,
          title: item.title || `Video ${i + 1}`,
          category: String(item.category || '').trim().toLowerCase(),
          reel: Boolean(item.reel),
          thumb: item.thumb || (!item.url && id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : ''),
        };
      })
      .filter((item) => item.id);
    allImages = (data.images || [])
      .filter((item) => item.url)
      .map((item, i) => ({ url: item.url, title: item.title || `Image ${i + 1}` }));
  } catch {
    showMessage('Could not load videos.json.', 8000);
    return;
  }
  setView('home');
}

/* Update and install */

const APP_FILES = ['./', 'app.js', 'style.css', 'videos.json'];
const UPDATE_CHECK_MS = 60000;
const updateButton = $('update');
const installButton = $('install');
let runningVersion = null;
let installPrompt = null;

async function readVersion(cache) {
  const texts = await Promise.all(APP_FILES.map(async (file) => {
    const response = await fetch(file, { cache });
    if (!response.ok) throw new Error(String(response.status));
    return response.text();
  }));
  return texts.join('\n');
}

async function checkForUpdate() {
  if (document.hidden || !runningVersion || !updateButton.hidden) return;
  try {
    updateButton.hidden = (await readVersion('no-cache')) === runningVersion;
  } catch {
    // Offline or mid-deployment: try again on the next check.
  }
}

async function watchForUpdates() {
  try {
    runningVersion = await readVersion('force-cache');
  } catch {
    return;
  }
  checkForUpdate();
  setInterval(checkForUpdate, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', checkForUpdate);
}

updateButton.addEventListener('click', () => location.reload());

function isInstalled() {
  return navigator.standalone === true
    || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
});

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  } else {
    showMessage('In Safari, tap Share, then Add to Home Screen.', 6000);
  }
});

if (isIos && !isInstalled()) installButton.hidden = false;

start().then(watchForUpdates);
