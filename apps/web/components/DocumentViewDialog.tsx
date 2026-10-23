'use client';

import { documentUrlSchema, type DocumentRecord } from '@harvestgo/shared';
import { useApi } from '@/lib/useApi';
import { Dialog, primaryButton, secondaryButton } from './Dialog';

/** Shows a private file using a link that works for only 5 minutes. */
export function DocumentViewDialog({ record, onClose }: { record: DocumentRecord; onClose: () => void }) {
  const link = useApi(`/documents/${record.id}/url`, documentUrlSchema);

  return (
    <Dialog title={record.caption || record.originalName} onClose={onClose}>
      {link.state.status === 'loading' && <p role="status" className="text-leaf-900/70">Getting the file...</p>}
      {link.state.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900">
          {link.state.message} <button onClick={link.reload} className="underline">Try again</button>
        </div>
      )}
      {link.state.status === 'ready' && (
        <div className="space-y-3">
          {record.mimeType.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.state.data.url} alt={record.caption || record.originalName} className="max-h-[60vh] w-full rounded-lg border-2 border-leaf-100 object-contain" />
          ) : (
            <p className="rounded-lg bg-leaf-50 p-4">This is a PDF. It opens in a new tab.</p>
          )}
          <p className="text-xs text-leaf-900/60">This private link works for 5 minutes. Reopen the file if it stops working.</p>
          <a href={link.state.data.url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} inline-block`}>
            {record.mimeType.startsWith('image/') ? 'Open full size' : 'Open the PDF'}
          </a>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
      </div>
    </Dialog>
  );
}