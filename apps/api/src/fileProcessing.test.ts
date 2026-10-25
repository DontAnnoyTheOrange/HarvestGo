import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareUpload, safeFileName } from './utils/fileProcessing.js';

const pdf = (extraBytes = 0) => Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'), Buffer.alloc(extraBytes)]);
const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 120, b: 30 } } })
    .withExif({ IFD0: { Copyright: 'secret-camera-info' } })
    .jpeg()
    .toBuffer();

describe('prepareUpload: what is the file REALLY?', () => {
  it('shrinks a big photo, keeps it a JPEG and removes hidden camera data', async () => {
    const original = await jpeg(3000, 2000);
    expect((await sharp(original).metadata()).exif).toBeDefined(); // the test photo does carry hidden data
    const out = await prepareUpload(original);
    const meta = await sharp(out.buffer).metadata();
    expect(out).toMatchObject({ mime: 'image/jpeg', ext: 'jpg', isImage: true });
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(meta.exif).toBeUndefined(); // gone: no camera model, no GPS location
    expect(out.buffer.length).toBeLessThan(original.length);
  });

  it('does not enlarge a small photo', async () => {
    const meta = await sharp((await prepareUpload(await jpeg(400, 300))).buffer).metadata();
    expect(meta.width).toBe(400);
  });

  it('accepts a PNG (even see-through) and turns it into a JPEG', async () => {
    const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const out = await prepareUpload(png);
    expect(out.mime).toBe('image/jpeg');
  });

  it('keeps a PDF as it is', async () => {
    const input = pdf();
    const out = await prepareUpload(input);
    expect(out).toMatchObject({ mime: 'application/pdf', ext: 'pdf', isImage: false });
    expect(out.buffer).toBe(input);
  });

  it('refuses a PDF over 5 MB', async () => {
    await expect(prepareUpload(pdf(5 * 1024 * 1024 + 10))).rejects.toMatchObject({ status: 413, code: 'FILE_TOO_LARGE' });
  });

  it.each([
    ['a Windows program (EXE) renamed to .jpg', Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00', 'binary')],
    ['a web page with a script', Buffer.from('<html><script>alert(1)</script></html>')],
    ['an SVG picture (can hold scripts)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['a plain text file', Buffer.from('hello, I am a harmless text file')],
    ['an empty file', Buffer.alloc(0)],
    ['random bytes', Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 37) % 251))],
  ])('refuses %s', async (_label, buf) => {
    await expect(prepareUpload(buf)).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_FILE' });
  });

  it('refuses a GIF (real picture type, but not allowed)', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer();
    await expect(prepareUpload(gif)).rejects.toMatchObject({ status: 415 });
  });

  it('refuses a broken JPEG with a clear message', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF'), Buffer.alloc(50, 7)]);
    await expect(prepareUpload(broken)).rejects.toMatchObject({ status: 400, code: 'BAD_IMAGE' });
  });
});

describe('safeFileName', () => {
  it('drops folders, strange characters and the old ending', () => {
    expect(safeFileName('../../etc/passwd.png', 'jpg')).toBe('passwd.jpg');
    expect(safeFileName('C:\\Users\\Mois\\foto.PNG', 'jpg')).toBe('foto.jpg');
    expect(safeFileName('a<b>"c|d?.jpg', 'jpg')).toBe('abcd.jpg');
  });
  it('has a fallback and a length limit', () => {
    expect(safeFileName('', 'pdf')).toBe('file.pdf');
    expect(safeFileName('x'.repeat(500) + '.jpg', 'jpg').length).toBeLessThanOrEqual(154);
  });
});