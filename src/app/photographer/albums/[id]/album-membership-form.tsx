"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { addPhotosToAlbum } from "@/app/photographer/actions";

type Candidate = { id: string; previewKey: string; originalFilename: string };

export function AlbumMembershipForm({ albumId, candidates }: { albumId: string; candidates: Candidate[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <Card className="p-6 md:p-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="sf-label text-[var(--accent)]">Choose existing</p><h2 className="sf-section-title mt-2">Add photos</h2><p className="sf-body-secondary mt-2">Only photos in your private library are available here.</p></div>{selected.length > 0 && <p className="sf-caption">{selected.length} selected</p>}</div>
    {candidates.length === 0 ? <p className="mt-6 rounded-[var(--radius-medium)] border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">No unassigned photos are available. Upload new photos below.</p> : <form action={addPhotosToAlbum} className="mt-6"><input type="hidden" name="albumId" value={albumId} />{selected.map((id) => <input key={id} type="hidden" name="photoIds" value={id} />)}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{candidates.map((photo) => { const isSelected = selected.includes(photo.id); return <label key={photo.id} className={`group cursor-pointer overflow-hidden rounded-[var(--radius-medium)] border ${isSelected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)]"}`}><div className="relative aspect-[4/3] bg-[var(--surface-elevated)]"><img src={`/api/previews/${photo.previewKey}`} alt={photo.originalFilename} className="h-full w-full object-cover" /><span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-[var(--ink)]/80"><input type="checkbox" checked={isSelected} onChange={() => toggle(photo.id)} aria-label={`Select ${photo.originalFilename}`} className="h-4 w-4 accent-[var(--accent)]" /></span></div><p className="truncate p-3 text-xs font-semibold" title={photo.originalFilename}>{photo.originalFilename}</p></label>; })}</div><Button type="submit" className="mt-5" disabled={!selected.length}>Add selected photos</Button></form>}
  </Card>;
}
