"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/form-fields";
import { MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES, MAX_PHOTOS_PER_UPLOAD, supportedMimeTypes } from "@/lib/photo-config";
import { PHOTOGRAPHER_UPLOAD_ENDPOINT } from "@/lib/upload-contract";
import { MINIMUM_PAID_PHOTO_PRICE_CENTS, priceValidationMessage } from "@/lib/pricing";
export function UploadWorkflow() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [price, setPrice] = useState("5.00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const totalBytes = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files]);
  const totalLabel = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
  const priceError = priceValidationMessage(price);

  function choose(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) { setMessage("Select at least one photo."); return; }
    if (priceError) { setMessage(priceError); return; }
    if (files.length > MAX_PHOTOS_PER_UPLOAD) { setMessage(`Select no more than ${MAX_PHOTOS_PER_UPLOAD} photos per batch.`); return; }
    if (files.some((file) => file.size > MAX_PHOTO_BYTES || !supportedMimeTypes.includes(file.type as never))) { setMessage("Remove files that exceed the size limit or use JPEG, PNG, or WebP."); return; }
    if (totalBytes > MAX_UPLOAD_BYTES) { setMessage(`This batch is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`); return; }
    setBusy(true);
    setMessage("Uploading photos…");
    const form = new FormData(event.currentTarget);
    form.delete("photos");
    files.forEach((file) => form.append("photos", file));
    try {
      const response = await fetch(PHOTOGRAPHER_UPLOAD_ENDPOINT, { method: "POST", body: form });
      const result = await response.json() as { error?: string; eventId?: string; uploaded?: number; errors?: string[] };
      if (!response.ok) throw new Error(result.error || "Upload failed");
      if (result.errors?.length) { setMessage(`${result.uploaded || 0} uploaded. ${result.errors.join(" ")}`); return; }
      router.push(`/photographer/photos?uploaded=${result.uploaded || 0}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-6" encType="multipart/form-data">
    <Card className="p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Photos</p><h2 className="sf-section-title mt-2">Add the moments</h2><p className="sf-body-secondary mt-2">Select up to {MAX_PHOTOS_PER_UPLOAD} JPEG, PNG, or WebP photos.</p></div><span className="sf-caption">Originals stay private until publication.</span></div>
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} className="mt-6 block cursor-pointer rounded-[var(--radius-medium)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-interactive)] p-8 text-center transition-colors hover:border-[var(--accent)] focus-within:border-[var(--accent)]"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-2xl text-white">↑</span><span className="mt-4 block font-bold">Drop photos here or browse files</span><span className="sf-body-secondary mt-2 block">Choose a batch. You can create an album after upload.</span><input name="photos" type="file" multiple accept={supportedMimeTypes.join(",")} onChange={(event) => choose(event.target.files)} className="sr-only" /></label>
      {files.length > 0 && <div className="mt-5 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] p-4"><p className="sf-label">Selected files</p><p className="mt-2 font-display text-2xl font-extrabold">{files.length} photos <span className="text-base font-medium text-[var(--text-secondary)]">· {totalLabel}</span></p><ul className="mt-3 grid gap-1 text-sm text-[var(--text-secondary)]">{files.slice(0, 5).map((file) => <li key={`${file.name}-${file.size}`} className="truncate">{file.name}</li>)}{files.length > 5 && <li>+ {files.length - 5} more</li>}</ul></div>}
    </Card>
    <Card className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><Input id="upload-price" name="priceDollars" label="Price per photo (USD)" hint={`Minimum price: $${(MINIMUM_PAID_PHOTO_PRICE_CENTS / 100).toFixed(2)} USD`} error={priceError || undefined} required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" value={price} onChange={(event) => { setPrice(event.target.value); setMessage(""); }} /><div><Button type="submit" loading={busy} disabled={busy || files.length === 0 || Boolean(priceError)}>Upload photos</Button></div></div><p className="sf-caption mt-4">Photos are added to your library. Create an album later when you are ready to organize and publish them.</p>{message && <p role="status" className="mt-4 text-sm text-[var(--error)]">{message}</p>}</Card>
  </form>;
}
