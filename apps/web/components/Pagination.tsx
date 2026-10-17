'use client';

import { secondaryButton } from './Dialog';

export function Pagination({ page, totalPages, total, noun, onPage }: {
  page: number; totalPages: number; total: number; noun: string; onPage: (p: number) => void;
}) {
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>{total} {noun}{total === 1 ? '' : 's'}</p>
      <div className="flex items-center gap-3">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className={secondaryButton}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className={secondaryButton}>Next</button>
      </div>
    </nav>
  );
}