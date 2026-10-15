import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';
import { AppShell } from '@/components/AppShell';
import { HarvestManager } from '@/components/HarvestManager';

export const metadata: Metadata = { title: 'Harvests | HarvestGo' };

export default async function HarvestsPage() {
  const jar = await cookies();
  if (!jar.has(ACCESS_COOKIE) && !jar.has(REFRESH_COOKIE)) redirect('/login');
  return (
    <AppShell>
      <HarvestManager />
    </AppShell>
  );
}