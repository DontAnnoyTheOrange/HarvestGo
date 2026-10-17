import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';
import { AppShell } from '@/components/AppShell';
import { SaleManager } from '@/components/SaleManager';

export const metadata: Metadata = { title: 'Sales | HarvestGo' };

export default async function SalesPage() {
  const jar = await cookies();
  if (!jar.has(ACCESS_COOKIE) && !jar.has(REFRESH_COOKIE)) redirect('/login');
  return (
    <AppShell>
      <SaleManager />
    </AppShell>
  );
}