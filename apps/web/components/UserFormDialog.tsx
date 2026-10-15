'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  ROLES, ROLE_LABELS, createUserSchema, updateUserSchema,
  type ManagedUser, type Role,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Errors = Partial<Record<'fullName' | 'email' | 'password' | 'role', string>>;

interface Props {
  /** Pass a user to edit them; leave out to create a new one. */
  user?: ManagedUser;
  /** True when the General Manager is editing their own account. */
  isSelf?: boolean;
  onSaved: (message: string) => void;
  onClose: () => void;
}

export function UserFormDialog({ user, isSelf = false, onSaved, onClose }: Props) {
  const editing = !!user;
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'administrative_staff');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Quick check on the screen; the server checks again.
    const check = editing
      ? updateUserSchema.safeParse({ fullName, role, isActive })
      : createUserSchema.safeParse({ fullName, email, role, password });
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors({ fullName: f.fullName?.[0], email: f.email?.[0], password: f.password?.[0], role: f.role?.[0] });
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      if (editing) {
        await apiFetch(`/users/${user.id}`, { method: 'PATCH', json: check.data });
        onSaved(`Saved changes to ${fullName}.`);
      } else {
        await apiFetch('/users', { method: 'POST', json: check.data });
        onSaved(`Account created for ${fullName}.`);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const d = err.details ?? {};
        setErrors({ fullName: d.fullName?.[0], email: d.email?.[0], password: d.password?.[0], role: d.role?.[0] });
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const field = (id: keyof Errors) => ({
    'aria-invalid': !!errors[id],
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
  });
  const fieldError = (id: keyof Errors) =>
    errors[id] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[id]}</p> : null;

  return (
    <Dialog title={editing ? 'Edit user' : 'Add a user'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>
        )}

        <div>
          <label htmlFor="fullName" className="block text-sm font-semibold">Full name *</label>
          <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="off" {...field('fullName')} />
          {fieldError('fullName')}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold">Email *</label>
          <input
            id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={editing} className={`${inputClass} disabled:bg-leaf-50`} autoComplete="off" {...field('email')}
          />
          {editing && <p className="mt-1 text-xs text-leaf-900/60">The email cannot be changed here.</p>}
          {fieldError('email')}
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-semibold">Role *</label>
          <select
            id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}
            disabled={isSelf} className={`${inputClass} disabled:bg-leaf-50`} {...field('role')}
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && <p className="mt-1 text-xs text-leaf-900/60">You cannot change your own role.</p>}
          {fieldError('role')}
        </div>

        {!editing && (
          <div>
            <label htmlFor="password" className="block text-sm font-semibold">Starting password *</label>
            <input
              id="password" type={showPassword ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" {...field('password')}
            />
            <p className="mt-1 text-xs text-leaf-900/60">10 to 72 characters, with at least one letter and one number.</p>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show password
            </label>
            {fieldError('password')}
          </div>
        )}

        {editing && (
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSelf} />
              Account is active
            </label>
            {isSelf && <p className="mt-1 text-xs text-leaf-900/60">You cannot disable your own account.</p>}
            {!isActive && (
              <p role="note" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                A disabled person is logged out at their next action and cannot log in until you turn the account back on. Their records stay.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Dialog>
  );
}
