'use client';

import { useCurrentUser } from './AppShell';

export function DashboardHome() {
  const user = useCurrentUser();
  const isManager = user.role === 'general_manager';
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-leaf-700">Welcome, {user.fullName}</h1>
      <section aria-labelledby="access" className="rounded-xl border-2 border-leaf-100 bg-white p-5">
        <h2 id="access" className="text-lg font-semibold">Your access</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-leaf-900/90">
          <li>Record and view harvests, sales, expenses, activities and issues</li>
          <li>Generate and download quarterly ATI reports</li>
          {isManager ? (
            <>
              <li>Delete records</li>
              <li>Create and manage user accounts</li>
              <li>Customize the report template</li>
            </>
          ) : (
            <li className="text-leaf-900/60">Deleting records and managing accounts are for the General Manager</li>
          )}
        </ul>
      </section>
      <p className="text-sm text-leaf-900/60">Data screens arrive in the next steps.</p>
    </div>
  );
}
