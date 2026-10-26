import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.CHAT_DATA_DIR || path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const writeLocks = new Map();

function writeFileAtomic(filePath, data) {
  const tmpPath = filePath + '.tmp.' + Date.now() + '.' + Math.random().toString(36).slice(2);
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);
}

export function loadJSON(filename, fallback) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading', filename, err.message);
  }
  return fallback;
}

export function saveJSON(filename, obj) {
  const filePath = path.join(DATA_DIR, filename);
  const data = JSON.stringify(obj, null, 2);
  try {
    writeFileAtomic(filePath, data);
  } catch (err) {
    console.error('Error saving', filename, err.message);
  }
}

export { DATA_DIR };