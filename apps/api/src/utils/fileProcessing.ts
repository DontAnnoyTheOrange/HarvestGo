import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { MAX_STORED_BYTES } from '@harvestgo/shared';
import { HttpError } from './errors.js';

// Keep memory use small on a modest server: one image at a time, no caching.
sharp.concurrency(1);
sharp.cache(false);

export interface PreparedFile {
  buffer: Buffer;
  mime: 'image/jpeg' | 'application/pdf';
  ext: 'jpg' | 'pdf';
  isImage: boolean;
}

const UNSUPPORTED = new HttpError(
  415,
  'UNSUPPORTED_FILE',
  'This file type is not allowed. Use a JPEG or PNG photo, or a PDF.',
);

/**
 * Looks at what the file REALLY is (its first bytes), ignoring its name and what the
 * browser claims. Photos are re-drawn as a smaller JPEG: this shrinks them for slow
 * connections, removes hidden data (camera model, GPS location) and destroys anything
 * disguised inside the image. PDFs are kept as they are (size-checked).
 */
export async function prepareUpload(input: Buffer): Promise<PreparedFile> {
  const type = await fileTypeFromBuffer(input);
  if (!type) throw UNSUPPORTED;

  if (type.mime === 'application/pdf') {
    if (input.length > MAX_STORED_BYTES) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'A PDF can be at most 5 MB.');
    }
    return { buffer: input, mime: 'application/pdf', ext: 'pdf', isImage: false };
  }

  if (type.mime === 'image/jpeg' || type.mime === 'image/png') {
    let out: Buffer;
    try {
      out = await sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate() // stand the photo upright using the camera's orientation, then forget it
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }) // PNG see-through areas become white
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new HttpError(400, 'BAD_IMAGE', 'This image could not be read. Try another photo.');
    }
    if (out.length > MAX_STORED_BYTES) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'This photo is still too large after shrinking. Try a smaller one.');
    }
    return { buffer: out, mime: 'image/jpeg', ext: 'jpg', isImage: true };
  }

  throw UNSUPPORTED;
}

/** A safe, short display name: no folders, no strange characters, correct ending. */
export function safeFileName(original: string, ext: 'jpg' | 'pdf'): string {
  const base = original
    .replace(/^.*[\\/]/, '') // drop any folder part
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\.[^.]*$/, '') // drop the old ending
    .trim()
    .slice(0, 150);
  return `${base || 'file'}.${ext}`;
}