"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/badge";
import { SafeImage } from "@/components/safe-image";
import { Input } from "@/components/form-fields";
import { createAlbumFromSelection } from "@/app/photographer/actions";

export type InventoryPhoto = {
  id: string;
  previewUrl: string;
  alt: string;
  originalFilename: string;
  albumTitle: string;
  collectionLabel?: string;
  status: string;
  priceLabel: string;
};

export function PhotoInventory({ photos }: { photos: InventoryPhoto[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAlbumFromSelection, { error: "" });
  const visibleIds = useMemo(() => photos.map((photo) => photo.id), [photos]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function togglePhoto(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-interactive)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 px-2 text-sm font-bold">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!photos.length} className="h-4 w-4 accent-[var(--accent)]" />
          Select all visible
        </label>
        {selectedIds.size > 0 && <span className="text-sm text-[var(--text-secondary)]">{selectedIds.size} selected</span>}
      </div>
      {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>Create album</Button>
        <Button type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
      </div>}
    </div>
    {createOpen && <div className="mb-5 rounded-[var(--radius-large)] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-elevated)]" role="dialog" aria-modal="true" aria-labelledby="create-album-title"><div className="flex items-start justify-between gap-4"><div><p className="sf-kicker">{selectedIds.size} selected</p><h2 id="create-album-title" className="sf-section-title mt-2">Create album</h2><p className="sf-body-secondary mt-2">Give these photos a name and set their album price.</p></div><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button></div><form action={formAction} className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">{[...selectedIds].map((id) => <input key={id} type="hidden" name="photoIds" value={id} />)}<Input id="create-album-name" name="name" label="Album name" required minLength={2} maxLength={120} autoFocus /><Input id="create-album-price" name="priceDollars" label="Price per photo (USD)" required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" defaultValue="5.00" /><Button type="submit" loading={pending}>Create</Button></form>{state.error && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--error)]">{state.error}</p>}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((photo) => {
        const selected = selectedIds.has(photo.id);
        return <Card key={photo.id} className={`overflow-hidden p-0 ${selected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : ""}`}>
          <div className="relative aspect-[4/3] bg-[var(--navy-soft)]">
            <SafeImage src={photo.previewUrl} alt={photo.alt} fallbackLabel="Preview unavailable" className="h-full w-full object-cover" />
            <label className="absolute left-3 top-3 inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-[var(--radius-small)] bg-[var(--ink)]/85 p-2 text-white shadow-lg">
              <span className="sr-only">Select {photo.originalFilename}</span>
              <input type="checkbox" checked={selected} onChange={() => togglePhoto(photo.id)} className="h-5 w-5 accent-[var(--accent)]" />
            </label>
          </div>
          <div className="p-3">
            <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-bold" title={photo.originalFilename}>{photo.originalFilename}</p><StatusBadge status={photo.status} /></div>
            <p className="sf-caption mt-2 truncate">{photo.albumTitle}{photo.collectionLabel ? ` · ${photo.collectionLabel}` : ""}</p>
            <p className="mt-3 text-sm font-extrabold">{photo.priceLabel}</p>
          </div>
        </Card>;
      })}
    </div>
  </div>;
}
