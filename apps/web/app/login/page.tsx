import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Log in | HarvestGo' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-4xl font-bold text-leaf-700">HarvestGo</h1>
        <p className="mt-2 text-leaf-900/80">Farm operations and compliance documentation for Kabutihan Farm.</p>
      </div>
      <div className="rounded-2xl border-2 border-leaf-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Log in</h2>
        <LoginForm />
        <p className="mt-4 text-sm text-leaf-900/70">No account? Ask the General Manager to create one for you.</p>
      </div>
    </main>
  );
}
