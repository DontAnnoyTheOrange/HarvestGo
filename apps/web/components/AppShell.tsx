'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABELS, type Role, type SessionUser } from '@harvestgo/shared';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/lib/useSession';

const UserContext = createContext<SessionUser | null>(null);

/** Gives any screen inside the shell access to "who is logged in". */
export function useCurrentUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <AppShell>');
  return user;
}

// Small line icons (decorative, so screen readers skip them).
const icons = {
  dashboard: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  harvest: 'M12 22V10M12 10C12 6 9 4 5 4c0 4 2 6 7 6zM12 13c0-3 2-5 6-5 0 3-2 5-6 5z',
  crops: 'M4 20h16M7 20V9l5-5 5 5v11M10 20v-5h4v5',
  users: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 3.5-6 8-6s8 2 8 6',
} as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}

interface NavItem { href: string; label: string; icon: keyof typeof icons }
interface NavGroup { label?: string; items: NavItem[] }

/** The menu. New screens in later steps are added here. */
function menuFor(role: Role): NavGroup[] {
  const groups: NavGroup[] = [
    { items: [{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
    { label: 'Farm records', items: [{ href: '/harvests', label: 'Harvests', icon: 'harvest' }] },
  ];
  if (role === 'general_manager') {
    groups.push({
      label: 'Administration',
      items: [
        { href: '/admin/crops', label: 'Crops', icon: 'crops' },
        { href: '/admin/users', label: 'Users', icon: 'users' },
      ],
    });
  }
  return groups;
}

/**
 * The frame around every logged-in page: a vertical sidebar on the left.
 * On phones and small tablets the sidebar slides in from a menu button.
 * Hiding a menu item is only a courtesy. The server and database decide what is really allowed.
 */
export function AppShell({ children, requireRole }: { children: ReactNode; requireRole?: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, reload } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login');
  }, [state.status, router]);

  // Close the slide-in menu after choosing a page.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Esc closes the menu, and focus moves into it when it opens.
  useEffect(() => {
    if (!menuOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  if (state.status === 'loading' || state.status === 'anonymous') {
    return <p role="status" className="p-8 text-leaf-900/70">Loading...</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="p-8">
        <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">{state.message}</p>
        <button onClick={() => void reload()} className="mt-4 rounded-lg bg-leaf-700 px-4 py-2 font-semibold text-white">Try again</button>
      </div>
    );
  }

  const { user } = state;
  const allowed = !requireRole || user.role === requireRole;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-screen md:flex">
        {/* Top bar: phones and small tablets only */}
        <header className="sticky top-0 z-20 flex items-center justify-between bg-leaf-700 px-4 py-3 text-white md:hidden">
          <span className="text-lg font-bold">HarvestGo</span>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu" aria-expanded={menuOpen} aria-controls="sidebar"
            className="rounded-lg border-2 border-white/70 px-3 py-1 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            Menu
          </button>
        </header>

        {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

        {/* The vertical sidebar */}
        <aside
          id="sidebar"
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-leaf-700 text-white transition-transform duration-200 md:sticky md:inset-y-auto md:top-0 md:z-auto md:h-screen md:translate-x-0 md:visible ${
            menuOpen ? 'translate-x-0' : '-translate-x-full invisible'
          }`}
        >
          <div className="flex items-center justify-between px-5 py-5">
            <span className="text-2xl font-bold">HarvestGo</span>
            <button
              ref={closeRef} onClick={() => setMenuOpen(false)} aria-label="Close menu"
              className="rounded-lg border-2 border-white/70 px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-white/40 md:hidden"
            >
              Close
            </button>
          </div>

          <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {menuFor(user.role).map((group, i) => (
              <div key={group.label ?? `group-${i}`}>
                {group.label && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-white/60">{group.label}</p>}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70 aria-[current=page]:bg-white aria-[current=page]:text-leaf-900"
                      >
                        <Icon name={item.icon} />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/20 p-4">
            <p className="text-sm font-semibold">{user.fullName}</p>
            <p className="text-xs text-white/70">{ROLE_LABELS[user.role]}</p>
            <button
              onClick={() => void logout()} disabled={loggingOut}
              className="mt-3 w-full rounded-lg border-2 border-white/70 px-3 py-2 text-sm font-semibold hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/40 disabled:opacity-60"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-5xl">
            {allowed ? (
              children
            ) : (
              <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
                You do not have access to this page.
              </p>
            )}
          </div>
        </main>
      </div>
    </UserContext.Provider>
  );
}