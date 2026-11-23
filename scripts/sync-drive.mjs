// Updates videos.json to match the public Google Drive folder.
import { readFile, writeFile } from 'node:fs/promises';

const FOLDER_ID = '1od0zKiFJyrgWIiKMDoIGuVqm1HLfZcQJ';
const FILE = new URL('../videos.json', import.meta.url);
const VIDEO_NAME = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;

const decode = (text) => text
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}`);
if (!response.ok) throw new Error(`Drive returned ${response.status}`);
const html = await response.text();

const found = [...html.matchAll(/id="entry-([\w-]+)".*?flip-entry-title">(.*?)<\/div>/gs)]
  .map(([, id, name]) => ({ id, name: decode(name).trim() }))
  .filter((file) => VIDEO_NAME.test(file.name))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

// An empty result is more likely a Drive error than an empty folder, so keep the current list.
if (!found.length) throw new Error('No videos found in the Drive folder');

const data = JSON.parse(await readFile(FILE, 'utf8'));
const idOf = (link) => link.match(/\/d\/([\w-]+)/)?.[1];
const foundIds = new Set(found.map((file) => file.id));
const kept = (data.videos || []).filter((video) => foundIds.has(idOf(video.link)));
const keptIds = new Set(kept.map((video) => idOf(video.link)));
const added = found
  .filter((file) => !keptIds.has(file.id))
  .map((file) => ({
    title: file.name.replace(VIDEO_NAME, ''),
    link: `https://drive.google.com/file/d/${file.id}/view`,
  }));

const removed = (data.videos || []).length - kept.length;
data.videos = [...kept, ...added];
const rows = data.videos.map((video) => `    ${JSON.stringify(video)}`).join(',\n');
const { videos, ...settings } = data;
const head = Object.entries(settings).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},\n`).join('');
await writeFile(FILE, `{\n${head}  "videos": [\n${rows}\n  ]\n}\n`);
console.log(`${videos.length} videos, ${added.length} added, ${removed} removed`);
