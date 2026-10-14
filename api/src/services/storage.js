import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_STORAGE_DIR = path.resolve(__dirname, '../../', config.STORAGE_DIR || '../storage');

/**
 * Asserts that a target path does not escape the base directory (path traversal defense).
 */
export function resolveSafePath(baseDir, ...subPaths) {
  const safeBase = path.resolve(baseDir);
  const resolved = path.resolve(safeBase, ...subPaths);
  if (!resolved.startsWith(safeBase)) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}

/**
 * Validates magic bytes, checks dimensions, auto-orients, and strips EXIF metadata.
 */
export async function processAndCleanImage(buffer, minDimension = 64) {
  // 1. Magic bytes validation using file-type
  const type = await fileTypeFromBuffer(buffer);
  const allowed = (config.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp')
    .split(',')
    .map((t) => t.trim().toLowerCase());

  if (!type || !allowed.includes(type.mime.toLowerCase())) {
    const error = new Error(`Unsupported media type: ${type ? type.mime : 'unknown'}`);
    error.statusCode = 415;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw error;
  }

  // 2. Metadata and dimension validation via sharp
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height || metadata.width < minDimension || metadata.height < minDimension) {
    const error = new Error(`Image resolution too low. Minimum dimension is ${minDimension}x${minDimension}px.`);
    error.statusCode = 422;
    error.code = 'IMAGE_TOO_SMALL';
    throw error;
  }

  // 3. Auto-orient and re-encode to JPEG (stripping EXIF / GPS)
  const cleanBuffer = await sharp(buffer)
    .rotate() // auto-orient based on EXIF before stripping
    .jpeg({ quality: 92 })
    .toBuffer();

  // 4. Compute SHA-256 checksum
  const sha256 = crypto.createHash('sha256').update(cleanBuffer).digest('hex');

  return {
    buffer: cleanBuffer,
    sha256,
    mime: 'image/jpeg',
    width: metadata.width,
    height: metadata.height,
  };
}

/**
 * Stores a cleaned case photo safely on disk.
 */
export async function saveCaseImage(patientId, caseId, sha256, buffer) {
  const caseDir = resolveSafePath(BASE_STORAGE_DIR, 'patients', String(patientId), String(caseId));
  await fs.promises.mkdir(caseDir, { recursive: true });

  const fileName = `${sha256}.jpg`;
  const filePath = resolveSafePath(caseDir, fileName);
  await fs.promises.writeFile(filePath, buffer);

  return {
    filePath,
    fileName,
    relativeUri: `patients/${patientId}/${caseId}/${fileName}`,
  };
}

/**
 * Stores an analysis artifact (e.g. heatmap PNG, overlay PNG) on disk.
 */
export async function saveCaseArtifact(patientId, caseId, artifactName, buffer) {
  // Sanitize artifactName (e.g. "overlay.png")
  const sanitizedName = path.basename(artifactName);
  const caseDir = resolveSafePath(BASE_STORAGE_DIR, 'patients', String(patientId), String(caseId));
  await fs.promises.mkdir(caseDir, { recursive: true });

  const filePath = resolveSafePath(caseDir, sanitizedName);
  await fs.promises.writeFile(filePath, buffer);
  return sanitizedName;
}

/**
 * Reads a stored case file or artifact safely.
 */
export async function getCaseFilePath(patientId, caseId, filename) {
  const sanitized = path.basename(filename);
  const caseDir = resolveSafePath(BASE_STORAGE_DIR, 'patients', String(patientId), String(caseId));
  const fullPath = resolveSafePath(caseDir, sanitized);

  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}

/**
 * Removes storage folder and all associated assets for a case.
 */
export async function deleteCaseStorage(patientId, caseId) {
  try {
    const caseDir = resolveSafePath(BASE_STORAGE_DIR, 'patients', String(patientId), String(caseId));
    if (fs.existsSync(caseDir)) {
      await fs.promises.rm(caseDir, { recursive: true, force: true });
    }
  } catch (err) {
    // Ignore if already deleted
  }
}
