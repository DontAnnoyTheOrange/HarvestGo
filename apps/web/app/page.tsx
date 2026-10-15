import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';

// This redirect is only for convenience. The real security check is on the server.
export default async function HomePage() {
  const jar = await cookies();
  redirect(jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE) ? '/dashboard' : '/login');
}
