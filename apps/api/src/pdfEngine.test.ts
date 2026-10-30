import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHROMIUM_PACK_VERSION, choosePdfEngine, chromiumPackUrl } from './reports/pdfRenderer.js';
import { embeddedFontCss } from './reports/fonts.js';

describe('which Chrome is used', () => {
  it('uses the normal Chrome on your own computer', () => {
    expect(choosePdfEngine({})).toBe('local');
    expect(choosePdfEngine({ NODE_ENV: 'production' })).toBe('local');
  });
  it('switches to the small serverless Chromium on Vercel and AWS Lambda by itself', () => {
    expect(choosePdfEngine({ VERCEL: '1' })).toBe('serverless');
    expect(choosePdfEngine({ AWS_LAMBDA_FUNCTION_NAME: 'x' })).toBe('serverless');
    expect(choosePdfEngine({ AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x' })).toBe('serverless');
  });
  it('can be forced either way with PDF_ENGINE (for example a Docker host that has a normal Chrome)', () => {
    expect(choosePdfEngine({ VERCEL: '1', PDF_ENGINE: 'local' })).toBe('local');
    expect(choosePdfEngine({ PDF_ENGINE: 'serverless' })).toBe('serverless');
    expect(choosePdfEngine({ PDF_ENGINE: 'nonsense' })).toBe('local');
  });
});

describe('where the serverless browser comes from', () => {
  it('builds the download address from the pinned version, or uses CHROMIUM_PACK_URL', () => {
    expect(chromiumPackUrl({})).toBe(`https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_PACK_VERSION}/chromium-v${CHROMIUM_PACK_VERSION}-pack.x64.tar`);
    expect(chromiumPackUrl({ CHROMIUM_PACK_URL: 'https://example.com/my-pack.tar' })).toBe('https://example.com/my-pack.tar');
  });

  it('matches the installed @sparticuz/chromium-min (a wrong pair would break reports on Vercel)', () => {
    // Walk up from the package's entry file to its package.json (the package hides it from normal lookups).
    let dir = path.dirname(createRequire(import.meta.url).resolve('@sparticuz/chromium-min'));
    while (!existsSync(path.join(dir, 'package.json')) || JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== '@sparticuz/chromium-min') {
      const up = path.dirname(dir);
      if (up === dir) throw new Error('package.json of @sparticuz/chromium-min not found');
      dir = up;
    }
    const installed = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version as string;
    expect(installed).toBe(CHROMIUM_PACK_VERSION);
  });
});

describe('fonts packed into the code', () => {
  it('has all four fonts, ready to use with nothing to look up', () => {
    const css = embeddedFontCss();
    expect((css.match(/@font-face/g) ?? []).length).toBe(4);
    expect(css).toContain("font-family:'Tinos'");
    expect(css).toContain("font-family:'Caladea'");
    expect(css).toContain('font-weight:700');
    expect(css).toContain('base64,d09GMg'); // every real WOFF2 font file starts with these letters
  });
});