'use client';

import { useState } from 'react';
import type { Crop } from '@harvestgo/shared';
import { useCategories, useCrops } from '@/lib/useCrops';
import { primaryButton, secondaryButton } from './Dialog';
import { CropFormDialog } from './CropFormDialog';

type Open = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; crop: Crop };

export function CropsManager() {
  const crops = useCrops(true);
  const categories = useCategories();
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => setOpen({ kind: 'none' });
  function saved(message: string) {
    close();
    setNotice(message);
    void crops.reload();
  }

  const ready = crops.state.status === 'ready' && categories.state.status === 'ready';
  const failed = crops.state.status === 'error' || categories.state.status === 'error';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Crops</h1>
          <p className="text-leaf-900/70">The list of crops and products that harvests, expenses and sales are recorded against.</p>
        </div>
        <button onClick={() => setOpen({ kind: 'create' })} disabled={!ready} className={primaryButton}>Add crop</button>
      </div>

      {notice && <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>}
      {!ready && !failed && <p role="status" className="text-leaf-900/70">Loading crops...</p>}
      {failed && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          Could not load the crop list.
          <button onClick={() => { void crops.reload(); void categories.reload(); }} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}

      {ready && crops.state.status === 'ready' && categories.state.status === 'ready' && (
        crops.state.items.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-leaf-100 bg-white p-6 text-center">
            No crops yet. Click <strong>Add crop</strong> to add the first one, for example Mushroom under Vegetables.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Crop list</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-3">Category</th>
                  <th scope="col" className="p-3">Crop</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {crops.state.items.map((c) => (
                  <tr key={c.id} className="border-t border-leaf-100">
                    <td className="p-3">{c.categoryName}</td>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3"><span className={c.isActive ? 'font-semibold text-leaf-700' : 'font-semibold text-red-700'}>{c.isActive ? 'In use' : 'Switched off'}</span></td>
                    <td className="p-3 text-right">
                      <button onClick={() => setOpen({ kind: 'edit', crop: c })} className={secondaryButton} aria-label={`Edit ${c.name}`}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {open.kind !== 'none' && categories.state.status === 'ready' && (
        <CropFormDialog
          crop={open.kind === 'edit' ? open.crop : undefined}
          categories={categories.state.items}
          onSaved={saved}
          onClose={close}
        />
      )}
    </div>
  );
}