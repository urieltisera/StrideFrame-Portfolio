"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, supportedMimeTypes, validateUploadBatch } from "@/lib/photo-config";
import { PHOTOGRAPHER_UPLOAD_ENDPOINT, priceDollarsFromCents } from "@/lib/upload-contract";
import { MINIMUM_PAID_PHOTO_PRICE_CENTS } from "@/lib/pricing";

export function UploadForm({ albumId, albumPriceCents }: { albumId: string; albumPriceCents: number }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (inputRef.current) {
      const transfer = new DataTransfer();
      next.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    setFiles(next);
    setMessage("");
    setMessageError(false);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) { setMessage("Select at least one photo."); setMessageError(true); return; }
    try {
      validateUploadBatch(files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Selected files are not valid.");
      setMessageError(true);
      return;
    }
    setBusy(true);
    setMessage("Uploading photos…");
    setMessageError(false);
    const form = new FormData();
    form.append("albumId", albumId);
    form.append("priceDollars", priceDollarsFromCents(albumPriceCents));
    files.forEach((file) => form.append("photos", file));
    try {
      const response = await fetch(PHOTOGRAPHER_UPLOAD_ENDPOINT, { method: "POST", body: form });
      let result: { error?: string; uploaded?: number; errors?: string[] } = {};
      try { result = await response.json() as typeof result; } catch { /* use the safe fallback below */ }
      if (!response.ok) throw new Error(result.error || "Upload could not be completed");
      const uploaded = result.uploaded || 0;
      setMessage(result.errors?.length ? `${uploaded} uploaded. ${result.errors.join(" ")}` : `${uploaded} ${uploaded === 1 ? "photo" : "photos"} uploaded.`);
      setMessageError(Boolean(result.errors?.length));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload could not be completed");
      setMessageError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} encType="multipart/form-data" className="grid max-w-2xl gap-4">
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} className="group block cursor-pointer rounded-[var(--radius-large)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-elevated)] p-8 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-interactive)] focus-within:border-[var(--accent)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-interactive)] text-2xl text-[var(--accent)]">↑</span>
        <span className="mt-4 block font-bold text-[var(--text-primary)]">Drop photos here or choose files</span>
        <span className="sf-body-secondary mt-2 block">JPEG, PNG or WebP · up to {MAX_PHOTOS_PER_UPLOAD} per batch</span>
        <input ref={inputRef} type="file" multiple accept={supportedMimeTypes.join(",")} onChange={(event) => choose(event.target.files)} className="sr-only" />
      </label>
      {files.length > 0 && <Card className="p-4"><p className="sf-label">Selected files · {files.length}</p><ul className="mt-3 grid gap-2 text-sm">{files.map((file) => { const invalid = file.size > MAX_PHOTO_BYTES || !supportedMimeTypes.includes(file.type as never); return <li key={`${file.name}-${file.size}`} className={`flex flex-wrap justify-between gap-2 ${invalid ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}><span className="truncate">{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.size > MAX_PHOTO_BYTES ? "Too large" : !supportedMimeTypes.includes(file.type as never) ? "Unsupported type" : "Ready"}</span></li>; })}</ul></Card>}
      <div className="rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><p className="sf-label">Price per photo</p><p className="mt-2 text-2xl font-black">${(albumPriceCents / 100).toFixed(2)} USD</p><p className="sf-caption mt-1">Minimum price: ${(MINIMUM_PAID_PHOTO_PRICE_CENTS / 100).toFixed(2)} USD. Every uploaded photo inherits this album price unless you later set an individual override.</p></div>
      <div className="flex flex-wrap items-center gap-4"><Button type="submit" loading={busy} disabled={busy || files.length === 0}>Upload photos</Button><p role="status" className={`sf-caption ${messageError ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}>{message || "Invalid files are reported individually."}</p></div>
    </form>
  );
}
