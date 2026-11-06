import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_TEMPLATE_CONFIG } from '@harvestgo/shared';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  reload: vi.fn(),
  templateState: { status: 'ready', data: { template: null as null | Record<string, unknown> } },
  user: { role: 'general_manager' },
}));

vi.mock('@/lib/api', () => ({
  apiFetch: mocks.apiFetch,
  apiFetchBlob: mocks.apiFetchBlob,
  ApiRequestError: class ApiRequestError extends Error {},
}));
vi.mock('@/lib/useApi', () => ({
  useApi: () => ({ state: mocks.templateState, reload: mocks.reload }),
}));
vi.mock('./AppShell', () => ({ useCurrentUser: () => mocks.user }));
vi.mock('./Dialog', () => ({
  Dialog: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}><h2>{title}</h2>{children}</div>
  ),
  inputClass: '',
  primaryButton: '',
  secondaryButton: '',
}));

import { ReportManager } from './ReportManager';

const reportList = { records: [], total: 0, page: 1, pageSize: 20 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.apiFetch.mockReset().mockImplementation(async (path: string) => path === '/report-templates/draft' ? { draft: null } : reportList);
  mocks.reload.mockReset();
  mocks.templateState = { status: 'ready', data: { template: null } };
  mocks.user = { role: 'general_manager' };
});

async function renderManager() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReportManager />);
    await Promise.resolve();
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button "${label}" was not found.`);
  return button;
}

describe('report template editor wiring', () => {
  it('opens from the official defaults when no template is active', async () => {
    const view = await renderManager();
    try {
      await act(async () => {
        findButton(view.container, 'Edit template settings').click();
      });

      expect(view.container.querySelector('[aria-label="Edit report template"]')).not.toBeNull();
      expect((view.container.querySelector('input') as HTMLInputElement | null)?.value).toBe(OFFICIAL_TEMPLATE_CONFIG.reportTitle);
    } finally {
      view.unmount();
    }
  });

  it('opens the flexible-template creation options when no template is active', async () => {
    const view = await renderManager();
    try {
      await act(async () => findButton(view.container, 'Create flexible template').click());
      expect(view.container.querySelector('[aria-label="Flexible report template editor"]')).not.toBeNull();
      expect(view.container.textContent).toContain('Blank flexible report');
      expect(view.container.textContent).toContain('Quarterly report starter');
    } finally {
      view.unmount();
    }
  });

  it('saves a template once and does not publish a duplicate version from the parent', async () => {
    mocks.templateState = {
      status: 'ready',
      data: {
        template: {
          id: 'template-1',
          name: 'Official ATI-QF/PAD-119 Rev. 00',
          version: 1,
          isActive: true,
          config: OFFICIAL_TEMPLATE_CONFIG,
          createdAt: '2026-10-01T00:00:00Z',
        },
      },
    };
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/report-templates/custom') return { template: { config: OFFICIAL_TEMPLATE_CONFIG } };
      return reportList;
    });

    const view = await renderManager();
    try {
      await act(async () => {
        findButton(view.container, 'Edit template').click();
      });
      await act(async () => {
        findButton(view.container, 'Save changes').click();
        await Promise.resolve();
      });

      const publishCalls = mocks.apiFetch.mock.calls.filter(([path]) => path === '/report-templates/custom');
      expect(publishCalls).toHaveLength(1);
      expect(mocks.reload).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  });
});
