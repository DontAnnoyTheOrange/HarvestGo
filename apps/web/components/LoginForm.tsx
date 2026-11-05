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
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative">
          <input
            id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-required="true" aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center justify-center bg-transparent px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
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
