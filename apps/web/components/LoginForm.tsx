'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { loginSchema } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

type FieldErrors = Partial<Record<'email' | 'password', string>>;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Quick check on the screen (the server checks again; this is just for faster help).
    const check = loginSchema.safeParse({ email, password });
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors;
      setFieldErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await apiFetch('/auth/login', { method: 'POST', json: check.data });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-lg border-2 border-leaf-100 bg-white px-3 py-2 text-base focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-600/30 aria-[invalid=true]:border-red-600';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby={formError ? 'form-error' : undefined}>
      {formError && (
        <p id="form-error" role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">
          {formError}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-semibold">
          Email <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <input
          id="email" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required="true" aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          className={inputClass}
        />
        {fieldErrors.email && <p id="email-error" className="mt-1 text-sm text-red-700">{fieldErrors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold">
          Password <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <input
          id="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-required="true" aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          className={inputClass}
        />
        {fieldErrors.password && <p id="password-error" className="mt-1 text-sm text-red-700">{fieldErrors.password}</p>}
      </div>

      <button
        type="submit" disabled={submitting}
        className="w-full rounded-lg bg-leaf-700 px-4 py-3 font-semibold text-white hover:bg-leaf-900 focus:outline-none focus:ring-4 focus:ring-leaf-600/40 disabled:opacity-60"
      >
        {submitting ? 'Logging in...' : 'Log in'}
      </button>
    </form>
  );
}
