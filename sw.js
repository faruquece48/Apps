/* Plays downloaded videos from the device instead of the network.
   Videos are stored in pieces by app.js (see "Downloads"); this file only reads them. */

const VIDEO_CACHE = 'videos-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !/\.(mp4|mkv|webm|mov)$/i.test(new URL(request.url).pathname)) return;
  event.respondWith(fromDevice(request).then((response) => response || fetch(request)));
});

async function fromDevice(request) {
  try {
    const cache = await caches.open(VIDEO_CACHE);
    const url = request.url.split('#')[0];
    const metaResponse = await cache.match(`${url}?meta`);
    if (!metaResponse) return null;
    const meta = await metaResponse.json();
    if (!meta.complete) return null;

    const { size, chunk, type } = meta;
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
    let start = 0;
    let end = size - 1;
    if (range) {
      if (range[1] === '') {
        start = Math.max(0, size - Number(range[2]));
      } else {
        start = Number(range[1]);
        if (range[2] !== '') end = Math.min(Number(range[2]), size - 1);
      }
      if (start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      // Answer with at most one piece at a time; the player asks for the rest as needed.
      end = Math.min(end, (Math.floor(start / chunk) + 1) * chunk - 1);
    }

    const parts = [];
    for (let i = Math.floor(start / chunk); i <= Math.floor(end / chunk); i++) {
      const piece = await cache.match(`${url}?part=${i}`);
      if (!piece) return null;
      parts.push(await piece.blob());
    }
    const offset = Math.floor(start / chunk) * chunk;
    const body = new Blob(parts).slice(start - offset, end - offset + 1);
    const headers = {
      'Content-Type': type || 'video/mp4',
      'Content-Length': String(body.size),
      'Accept-Ranges': 'bytes',
    };
    if (!range) return new Response(body, { status: 200, headers });
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: 206, headers });
  } catch {
    return null;
  }
}
