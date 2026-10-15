'use client';

import { useState } from 'react';
import { Dialog, primaryButton, secondaryButton } from './Dialog';

/** "Are you sure?" box for actions that cannot be undone. */
export function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
      <p className="text-leaf-900/90">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="button" onClick={() => void confirm()} disabled={busy} className={`${primaryButton} !bg-red-700 hover:!bg-red-900`}>
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}