'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { resetPasswordSchema, type ManagedUser } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

export function ResetPasswordDialog({ user, onSaved, onClose }: { user: ManagedUser; onSaved: (m: string) => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const check = resetPasswordSchema.safeParse({ password });
    if (!check.success) {
      setError(z.flattenError(check.error).fieldErrors.password?.[0] ?? 'Invalid password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/users/${user.id}/reset-password`, { method: 'POST', json: check.data });
      onSaved(`New password set for ${user.fullName}. Share it with them privately.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.details?.password?.[0] ?? err.message) : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Reset password for ${user.fullName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
        <div>
          <label htmlFor="newPassword" className="block text-sm font-semibold">New password *</label>
          <input id="newPassword" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
          <p className="mt-1 text-xs text-leaf-900/60">10 to 72 characters, with at least one letter and one number.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-semibold">Type it again *</label>
          <input id="confirmPassword" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Set new password'}</button>
        </div>
      </form>
    </Dialog>
  );
}
