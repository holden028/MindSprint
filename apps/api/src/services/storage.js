const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 200);
}

function extFromFilename(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ext.slice(0, 20);
}

function saveFile(file, userId) {
  ensureUploadDir();
  const id = randomUUID();
  const ext = extFromFilename(file.originalname);
  const userDir = path.join(UPLOAD_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });

  const storageKey = path.join(String(userId), `${id}${ext}`);
  const absolutePath = path.join(UPLOAD_DIR, storageKey);
  fs.writeFileSync(absolutePath, file.buffer);

  return {
    storageKey,
    absolutePath,
    filename: sanitizeFilename(file.originalname),
    mimeType: file.mimetype || 'application/octet-stream',
    sizeBytes: file.size
  };
}

function getAbsolutePath(storageKey) {
  const resolved = path.resolve(UPLOAD_DIR, storageKey);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

function deleteFile(storageKey) {
  try {
    const absolutePath = getAbsolutePath(storageKey);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (err) {
    console.error('Failed to delete attachment file:', err.message);
  }
}

function readFileBuffer(storageKey) {
  const absolutePath = getAbsolutePath(storageKey);
  return fs.readFileSync(absolutePath);
}

module.exports = {
  UPLOAD_DIR,
  MAX_UPLOAD_BYTES,
  saveFile,
  getAbsolutePath,
  deleteFile,
  readFileBuffer
};
