'use client';

import { useMemo, useState } from 'react';
import { z } from 'zod';
import { OFFICIAL_TEMPLATE_CONFIG, reportTemplateConfigSchema, type ReportTemplateConfig } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

function fieldClass(hasError: boolean) {
  return `${inputClass} ${hasError ? 'border-red-600' : ''}`;
}

export function TemplateEditorDialog({
  initial,
  onSaved,
  onClose,
}: {
  initial?: ReportTemplateConfig;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<ReportTemplateConfig>(initial ?? OFFICIAL_TEMPLATE_CONFIG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const summary = useMemo(() => {
    const header = config.header.lines.filter(Boolean).length;
    return `${header} header lines, ${config.services.enabled ? 'services enabled' : 'services hidden'}, ${config.photos.maxPhotos} max photos`;
  }, [config]);

  function update<K extends keyof ReportTemplateConfig>(key: K, value: ReportTemplateConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function updateDeep<T extends object>(section: keyof ReportTemplateConfig, patch: T) {
    setConfig((c) => ({ ...c, [section]: { ...(c[section] as object), ...patch } as never }));
  }

  async function submit() {
    setError(null);
    const parsed = reportTemplateConfigSchema.safeParse(config);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || 'root';
        nextErrors[path] = issue.message;
      }
      setFieldErrors(nextErrors);
      setError('Please fix the highlighted template settings before saving.');
      return;
    }

    setFieldErrors({});
    setBusy(true);
    try {
      await apiFetch<unknown>('/report-templates/custom', {
        method: 'POST',
        json: parsed.data,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Edit report template" onClose={onClose}>
      <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
        {!initial && <p className="rounded-lg bg-leaf-50 p-3 text-sm">Starting from the official ATI template. Saving will create the first active version.</p>}
        <p className="text-sm text-leaf-900/70">{summary}</p>

        {error && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold">Report title</label>
            <input value={config.reportTitle} onChange={(e) => update('reportTitle', e.target.value)} className={fieldClass(!!fieldErrors.reportTitle)} />
            {fieldErrors.reportTitle && <p className="mt-1 text-sm text-red-700">{fieldErrors.reportTitle}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold">Farm name</label>
            <input value={config.farmName} onChange={(e) => update('farmName', e.target.value)} className={fieldClass(!!fieldErrors.farmName)} />
            {fieldErrors.farmName && <p className="mt-1 text-sm text-red-700">{fieldErrors.farmName}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold">Footer text</label>
            <input value={config.footerText} onChange={(e) => update('footerText', e.target.value)} className={fieldClass(!!fieldErrors.footerText)} />
            {fieldErrors.footerText && <p className="mt-1 text-sm text-red-700">{fieldErrors.footerText}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold">Photos enabled</label>
              <input type="checkbox" checked={config.photos.enabled} onChange={(e) => updateDeep('photos', { enabled: e.target.checked })} className="mt-2 h-4 w-4" />
            </div>
            <div>
              <label className="block text-sm font-semibold">Max photos</label>
              <input type="number" min={1} max={12} value={config.photos.maxPhotos} onChange={(e) => updateDeep('photos', { maxPhotos: Number(e.target.value) })} className={fieldClass(!!fieldErrors['photos.maxPhotos'])} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold">Page size</label>
              <select value={config.page.size} onChange={(e) => updateDeep('page', { size: e.target.value as ReportTemplateConfig['page']['size'] })} className={fieldClass(!!fieldErrors['page.size'])}>
                <option value="long">long</option>
                <option value="a4">a4</option>
                <option value="letter">letter</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold">Orientation</label>
              <select value={config.page.orientation} onChange={(e) => updateDeep('page', { orientation: e.target.value as ReportTemplateConfig['page']['orientation'] })} className={fieldClass(!!fieldErrors['page.orientation'])}>
                <option value="landscape">landscape</option>
                <option value="portrait">portrait</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>
    </Dialog>
  );
}
