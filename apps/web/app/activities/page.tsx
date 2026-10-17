import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';
import { ActivityManager } from '@/components/ActivityManager';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = { title: 'Activities | HarvestGo' };

export default async function ActivitiesPage() {
  const jar = await cookies();
  if (!jar.has(ACCESS_COOKIE) && !jar.has(REFRESH_COOKIE)) redirect('/login');
  return (
    <AppShell>
      <ActivityManager />
    </AppShell>
  );
}