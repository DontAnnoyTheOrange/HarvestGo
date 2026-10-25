'use client';

import { reportUrlSchema, type ReportRecord } from '@harvestgo/shared';
import { useApi } from '@/lib/useApi';
import { Dialog, primaryButton, secondaryButton } from './Dialog';

/** Gives a private report to download using a link that works for only 5 minutes. */
export function ReportDownloadDialog({ record, onClose }: { record: ReportRecord; onClose: () => void }) {
  const link = useApi(`/reports/${record.id}/url`, reportUrlSchema);

  return (
    <Dialog title={`Q${record.periodQuarter} ${record.periodYear} report`} onClose={onClose}>
      {link.state.status === 'loading' && <p role="status" className="text-leaf-900/70">Getting the report...</p>}
      {link.state.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900">
          {link.state.message} <button onClick={link.reload} className="underline">Try again</button>
        </div>
      )}
      {link.state.status === 'ready' && (
        <div className="space-y-3">
          <p>Your report is ready: <strong className="break-all">{record.fileName}</strong></p>
          <a href={link.state.data.url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} inline-block`}>Download PDF</a>
          <p className="text-xs text-leaf-900/60">This private link works for 5 minutes. Reopen the report if it stops working.</p>
          <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            HarvestGo does not send reports to DA-ATI. Download the PDF, check it, then submit it by email or in person.
          </p>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
      </div>
    </Dialog>
  );
}