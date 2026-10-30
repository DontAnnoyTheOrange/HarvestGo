import type { Browser } from 'puppeteer';
import { HttpError, ServiceUnavailableError } from '../utils/errors.js';

export interface PdfJob {
  html: string;
  width: string;
  height: string;
  footerHtml: string;
  margin: { top: string; right: string; bottom: string; left: string };
}

const RENDER_TIMEOUT_MS = 55_000; // a first report on a serverless host also has to fetch the browser
const IDLE_CLOSE_MS = 2 * 60_000; // give the memory back after 2 quiet minutes
const MAX_WAITING = 3; // at most 3 reports waiting in line; more get "busy, try again"

export type PdfEngine = 'local' | 'serverless';

/**
 * Which Chrome to use.
 * - "local": the normal Chrome that Puppeteer downloads (your computer, or a server you control, e.g. a Docker host).
 * - "serverless": a small Chromium made for hosts like Vercel, where the normal Chrome cannot run.
 * It is chosen automatically (Vercel and AWS Lambda are detected) and can be forced with PDF_ENGINE=local or serverless.
 */
export function choosePdfEngine(env: NodeJS.ProcessEnv = process.env): PdfEngine {
  if (env.PDF_ENGINE === 'local' || env.PDF_ENGINE === 'serverless') return env.PDF_ENGINE;
  return env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV ? 'serverless' : 'local';
}

/**
 * The version of the small serverless browser. It MUST match the installed package
 * "@sparticuz/chromium-min" (pinned to this exact version in apps/api/package.json; a test checks they agree).
 */
export const CHROMIUM_PACK_VERSION = '153.0.0';

/** Where the small serverless browser is downloaded from (once per cold start). Can be replaced with CHROMIUM_PACK_URL. */
export function chromiumPackUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHROMIUM_PACK_URL) return env.CHROMIUM_PACK_URL;
  const v = CHROMIUM_PACK_VERSION;
  return `https://github.com/Sparticuz/chromium/releases/download/v${v}/chromium-v${v}-pack.x64.tar`;
}

/**
 * Turns a web page into a PDF using a hidden Chrome browser.
 * - ONE browser is shared, and reports are made ONE AT A TIME (saves memory on a small server).
 * - The page is locked down: JavaScript is OFF and every request to the internet or the
 *   computer's files is BLOCKED. Only the page itself (with its embedded pictures and fonts) can be used.
 */
export class PdfRenderer {
  private browser: Browser | null = null;
  private line: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  async render(job: PdfJob): Promise<Buffer> {
    if (this.waiting >= MAX_WAITING) {
      throw new HttpError(429, 'BUSY', 'The system is busy making other reports. Please try again in a minute.');
    }
    this.waiting += 1;
    const mine = this.line.then(() => this.run(job));
    this.line = mine.catch(() => undefined);
    try {
      return await mine;
    } finally {
      this.waiting -= 1;
    }
  }

  private async launch(): Promise<Browser> {
    const args = ['--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-extensions'];
    // Some servers (containers) need this. Only turn it on there: PDF_NO_SANDBOX=true
    if (process.env.PDF_NO_SANDBOX === 'true') args.push('--no-sandbox');
    if (process.env.PDF_EXTRA_ARGS) args.push(...process.env.PDF_EXTRA_ARGS.split(' ').filter(Boolean));

    if (choosePdfEngine() === 'serverless') {
      const chromium = (await import('@sparticuz/chromium-min')).default;
      const puppeteer = (await import('puppeteer-core')).default;
      const browser = await puppeteer.launch({
        args: [...chromium.args, ...args],
        executablePath: await chromium.executablePath(chromiumPackUrl()),
        headless: 'shell',
      });
      return browser as unknown as Browser;
    }

    const puppeteer = (await import('puppeteer')).default;
    return puppeteer.launch({ headless: process.env.PDF_HEADLESS === 'shell' ? 'shell' : true, args });
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    try {
      this.browser = await this.launch();
    } catch (err) {
      throw new ServiceUnavailableError(`could not start the PDF browser (${choosePdfEngine()} engine): ${err instanceof Error ? err.message : String(err)}`);
    }
    this.browser.on('disconnected', () => {
      this.browser = null;
    });
    return this.browser;
  }

  private async run(job: PdfJob): Promise<Buffer> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        // Only our own page and the pictures/fonts packed inside it. Everything else is refused.
        if (url.startsWith('data:') || url === 'about:blank') void req.continue();
        else void req.abort();
      });
      await page.setContent(job.html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      const pdf = await page.pdf({
        width: job.width,
        height: job.height,
        margin: job.margin,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: job.footerHtml,
        timeout: RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new ServiceUnavailableError(`PDF creation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await page.close().catch(() => undefined);
      this.idleTimer = setTimeout(() => void this.close(), IDLE_CLOSE_MS);
      this.idleTimer.unref();
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const b = this.browser;
    this.browser = null;
    await b?.close().catch(() => undefined);
  }
}

/** The one shared renderer used by the whole server. */
export const pdfRenderer = new PdfRenderer();