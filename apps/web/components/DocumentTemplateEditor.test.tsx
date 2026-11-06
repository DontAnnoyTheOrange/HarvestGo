import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), apiFetchBlob: vi.fn() }));
vi.mock('@/lib/api', () => ({
  apiFetch: mocks.apiFetch,
  apiFetchBlob: mocks.apiFetchBlob,
  ApiRequestError: class ApiRequestError extends Error {
    details?: Record<string, string[]>;
    constructor(message: string, details?: Record<string, string[]>) {
      super(message);
      this.details = details;
    }
  },
}));
vi.mock('./Dialog', () => ({
  Dialog: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}><h2>{title}</h2>{children}</div>
  ),
  inputClass: '',
  primaryButton: '',
  secondaryButton: '',
}));

import { DocumentTemplateEditor } from './DocumentTemplateEditor';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.apiFetch.mockReset().mockImplementation(async (path: string) => path === '/report-templates/draft' ? { draft: null } : {});
  mocks.apiFetchBlob.mockReset().mockResolvedValue(new Blob(['%PDF-preview'], { type: 'application/pdf' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:template-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

async function renderEditor() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DocumentTemplateEditor onSaved={vi.fn()} onClose={vi.fn()} />);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Button "${label}" was not found.`);
  return found;
}

describe('DocumentTemplateEditor', () => {
  it('offers blank and starter creation choices when there is no active v2 template', async () => {
    const view = await renderEditor();
    try {
      expect(view.container.textContent).toContain('Blank flexible report');
      expect(view.container.textContent).toContain('Quarterly report starter');
      await act(async () => button(view.container, 'Blank flexible report').click());
      expect(view.container.querySelector('[aria-label="Page preview"]')).not.toBeNull();
      expect(view.container.querySelector('#document-name')).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('edits advanced photo placement, previews the renderer PDF, and publishes only once', async () => {
    const onSaved = vi.fn();
    mocks.apiFetch.mockImplementation(async (path: string, options?: { json?: unknown }) => {
      if (path === '/report-templates/draft' && !options) return { draft: null };
      if (path === '/report-templates/draft') return { draft: { document: options?.json, updatedAt: '2026-11-06T08:00:00Z' } };
      return {};
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<DocumentTemplateEditor onSaved={onSaved} onClose={vi.fn()} />));
    try {
      await act(async () => button(container, 'Quarterly report starter').click());
      const addElement = container.querySelector('select[aria-label="Add element"]');
      if (!(addElement instanceof HTMLSelectElement)) throw new Error('Element picker was not found.');
      await act(async () => {
        addElement.value = 'photo_group';
        addElement.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(container.textContent).toContain('Start photo');
      expect(container.textContent).toContain('Continue to pages');

      await act(async () => {
        button(container, 'Save draft').click();
        await Promise.resolve();
      });
      expect(mocks.apiFetch).toHaveBeenCalledWith('/report-templates/draft', expect.objectContaining({ method: 'POST' }));
      const name = container.querySelector<HTMLInputElement>('#document-name');
      if (!name) throw new Error('Template name field was not found.');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(name, 'Unsaved change');
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => button(container, 'Load saved draft').click());
      expect(container.querySelector<HTMLInputElement>('#document-name')?.value).toBe('Quarterly Farm Report');

      await act(async () => {
        button(container, 'Preview PDF').click();
        await Promise.resolve();
      });
      expect(mocks.apiFetchBlob).toHaveBeenCalledWith('/report-templates/preview', expect.objectContaining({
        method: 'POST',
        json: expect.objectContaining({ document: expect.objectContaining({ schemaVersion: 2 }), year: expect.any(Number), quarter: expect.any(Number) }),
      }));
      expect(container.querySelector('iframe[title="Rendered report PDF preview"]')).not.toBeNull();

      await act(async () => {
        button(container, 'Save and publish').click();
        await Promise.resolve();
      });
      const saves = mocks.apiFetch.mock.calls.filter(([path]) => path === '/report-templates/custom');
      expect(saves).toHaveLength(1);
      expect(saves[0]?.[1]).toMatchObject({ method: 'POST', json: { schemaVersion: 2 } });
      expect(onSaved).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
