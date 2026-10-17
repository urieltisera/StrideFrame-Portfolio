"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, supportedMimeTypes } from "@/lib/photo-config";

export function UploadForm({ albumId, albumPriceCents, action }: { albumId: string; albumPriceCents: number; action: (data: FormData) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const choose = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).slice(0, MAX_PHOTOS_PER_UPLOAD);
    if (inputRef.current) {
      const transfer = new DataTransfer();
      next.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    setFiles(next);
  };

  return (
    <form action={async (data) => { setBusy(true); await action(data); }} encType="multipart/form-data" className="grid max-w-2xl gap-4">
      <input type="hidden" name="albumId" value={albumId} />
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} className="group block cursor-pointer rounded-[var(--radius-large)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-elevated)] p-8 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-interactive)] focus-within:border-[var(--accent)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-interactive)] text-2xl text-[var(--accent)]">↑</span>
        <span className="mt-4 block font-bold text-[var(--text-primary)]">Drop photos here or choose files</span>
        <span className="sf-body-secondary mt-2 block">JPEG, PNG or WebP · up to {MAX_PHOTOS_PER_UPLOAD} per batch</span>
        <input ref={inputRef} name="photos" type="file" multiple accept={supportedMimeTypes.join(",")} onChange={(event) => choose(event.target.files)} className="sr-only" />
      </label>
      {files.length > 0 && <Card className="p-4"><p className="sf-label">Selected files · {files.length}</p><ul className="mt-3 grid gap-2 text-sm">{files.map((file) => { const invalid = file.size > MAX_PHOTO_BYTES || !supportedMimeTypes.includes(file.type as never); return <li key={`${file.name}-${file.size}`} className={`flex flex-wrap justify-between gap-2 ${invalid ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}><span className="truncate">{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.size > MAX_PHOTO_BYTES ? "Too large" : !supportedMimeTypes.includes(file.type as never) ? "Unsupported type" : "Ready"}</span></li>; })}</ul></Card>}
      <div className="rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><p className="sf-label">Price per photo</p><p className="mt-2 text-2xl font-black">${(albumPriceCents / 100).toFixed(2)} USD</p><p className="sf-caption mt-1">Every uploaded photo inherits this album price unless you later set an individual override.</p></div>
      <div className="flex flex-wrap items-center gap-4"><Button type="submit" loading={busy} disabled={busy || files.length === 0}>Upload photos</Button><p className="sf-caption">Invalid files are reported individually.</p></div>
    </form>
  );
}
