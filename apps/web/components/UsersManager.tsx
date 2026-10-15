'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, managedUserSchema, type ManagedUser } from '@harvestgo/shared';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { useCurrentUser } from './AppShell';
import { primaryButton, secondaryButton } from './Dialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { UserFormDialog } from './UserFormDialog';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; users: ManagedUser[] };
type Open = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; user: ManagedUser } | { kind: 'reset'; user: ManagedUser };

export function UsersManager() {
  const me = useCurrentUser();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: unknown }>('/users');
      const users = z.array(managedUserSchema).parse(data.users);
      setLoad({ status: 'ready', users });
    } catch (err) {
      setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load users.' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function saved(message: string) {
    setOpen({ kind: 'none' });
    setNotice(message);
    void refresh();
  }
  const close = () => setOpen({ kind: 'none' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Users</h1>
          <p className="text-leaf-900/70">Create accounts, change roles, switch accounts off, and reset passwords.</p>
        </div>
        <button onClick={() => setOpen({ kind: 'create' })} className={primaryButton}>Add user</button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>
      )}

      {load.status === 'loading' && <p role="status" className="text-leaf-900/70">Loading users...</p>}
      {load.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          {load.message}
          <button onClick={() => void refresh()} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}
      {load.status === 'ready' && load.users.length === 0 && <p>No users yet.</p>}
      {load.status === 'ready' && load.users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">HarvestGo user accounts</caption>
            <thead className="bg-leaf-50 text-leaf-900">
              <tr>
                <th scope="col" className="p-3">Name</th>
                <th scope="col" className="p-3">Email</th>
                <th scope="col" className="p-3">Role</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {load.users.map((u) => (
                <tr key={u.id} className="border-t border-leaf-100">
                  <td className="p-3 font-medium">{u.fullName}{u.id === me.id && <span className="ml-2 text-xs text-leaf-900/60">(you)</span>}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{ROLE_LABELS[u.role]}</td>
                  <td className="p-3">
                    <span className={u.isActive ? 'font-semibold text-leaf-700' : 'font-semibold text-red-700'}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setOpen({ kind: 'edit', user: u })} className={secondaryButton} aria-label={`Edit ${u.fullName}`}>Edit</button>
                      <button onClick={() => setOpen({ kind: 'reset', user: u })} className={secondaryButton} aria-label={`Reset password for ${u.fullName}`}>Reset password</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open.kind === 'create' && <UserFormDialog onSaved={saved} onClose={close} />}
      {open.kind === 'edit' && <UserFormDialog user={open.user} isSelf={open.user.id === me.id} onSaved={saved} onClose={close} />}
      {open.kind === 'reset' && <ResetPasswordDialog user={open.user} onSaved={saved} onClose={close} />}
    </div>
  );
}
