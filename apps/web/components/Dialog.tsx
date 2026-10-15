'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A pop-up box built on the browser's own <dialog>, which already handles
 * keyboard focus, the Esc key and screen readers correctly.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref} onClose={onClose} aria-labelledby={titleId}
      className="m-auto w-full max-w-md rounded-2xl border-2 border-leaf-100 bg-white p-0 text-leaf-900 backdrop:bg-black/50"
    >
      <div className="p-6">
        <h2 id={titleId} className="mb-4 text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export const inputClass =
  'mt-1 block w-full rounded-lg border-2 border-leaf-100 bg-white px-3 py-2 text-base focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-600/30 aria-[invalid=true]:border-red-600';
export const primaryButton =
  'rounded-lg bg-leaf-700 px-4 py-2 font-semibold text-white hover:bg-leaf-900 focus:outline-none focus:ring-4 focus:ring-leaf-600/40 disabled:opacity-60';
export const secondaryButton =
  'rounded-lg border-2 border-leaf-600 px-4 py-2 font-semibold text-leaf-700 hover:bg-leaf-50 focus:outline-none focus:ring-4 focus:ring-leaf-600/30 disabled:opacity-60';
