"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/form-fields";
import { MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES, MAX_PHOTOS_PER_UPLOAD, supportedMimeTypes } from "@/lib/photo-config";

type EventOption = { id: string; title: string; status: string; albums: Array<{ id: string; title: string; priceCents: number; status: string }> };

export function UploadWorkflow({ events }: { events: EventOption[] }) {
  const router = useRouter();
  const [eventChoice, setEventChoice] = useState(events[0]?.id || "__new__");
  const [albumId, setAlbumId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [price, setPrice] = useState("5.00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedEvent = events.find((event) => event.id === eventChoice);
  const selectedAlbum = selectedEvent?.albums.find((album) => album.id === albumId);
  const totalBytes = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files]);
  const totalLabel = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;

  function choose(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
    setMessage("");
  }

  function selectEvent(value: string) {
    setEventChoice(value);
    setAlbumId("");
    const event = events.find((item) => item.id === value);
    const album = event?.albums.find((item) => item.title === "Event photos");
    setPrice(album ? (album.priceCents / 100).toFixed(2) : "5.00");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) { setMessage("Select at least one photo."); return; }
    if (files.length > MAX_PHOTOS_PER_UPLOAD) { setMessage(`Select no more than ${MAX_PHOTOS_PER_UPLOAD} photos per batch.`); return; }
    if (files.some((file) => file.size > MAX_PHOTO_BYTES || !supportedMimeTypes.includes(file.type as never))) { setMessage("Remove files that exceed the size limit or use JPEG, PNG, or WebP."); return; }
    if (totalBytes > MAX_UPLOAD_BYTES) { setMessage(`This batch is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`); return; }
    setBusy(true);
    setMessage("Uploading photos…");
    const form = new FormData(event.currentTarget);
    form.delete("photos");
    files.forEach((file) => form.append("photos", file));
    form.set("eventId", eventChoice);
    form.set("albumId", albumId);
    try {
      const response = await fetch("/api/photographer/upload", { method: "POST", body: form });
      const result = await response.json() as { error?: string; eventId?: string; uploaded?: number; errors?: string[] };
      if (!response.ok) throw new Error(result.error || "Upload failed");
      if (result.errors?.length) { setMessage(`${result.uploaded || 0} uploaded. ${result.errors.join(" ")}`); return; }
      router.push(`/photographer/events/${result.eventId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-6" encType="multipart/form-data">
    <Card className="p-6 md:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2"><span className="sf-label">Event</span><select name="eventId" value={eventChoice} onChange={(event) => selectEvent(event.target.value)} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"><option value="__new__">Create a new event</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <div className="grid gap-2"><span className="sf-label">Album</span><select name="albumId" value={albumId} onChange={(event) => { setAlbumId(event.target.value); const album = selectedEvent?.albums.find((item) => item.id === event.target.value); if (album) setPrice((album.priceCents / 100).toFixed(2)); }} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"><option value="">Event photos</option>{selectedEvent?.albums.filter((album) => album.title !== "Individual photos").map((album) => <option key={album.id} value={album.id}>{album.title}{album.status === "PUBLISHED" ? " · Published" : " · Draft"}</option>)}</select><span className="sf-caption">Optional. Advanced album organization remains available from the event workspace.</span></div>
      </div>
      {eventChoice === "__new__" && <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 md:grid-cols-2"><Input id="event-title" name="eventTitle" label="New event name" required placeholder="Saturday race" /><label htmlFor="event-description" className="grid gap-2"><span className="sf-label">Description <span className="font-normal normal-case tracking-normal">(optional)</span></span><textarea id="event-description" name="eventDescription" rows={2} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" placeholder="A short description" /></label><p className="sf-caption md:col-span-2">The event stays private as a draft. You can publish it when the gallery is ready.</p></div>}
    </Card>
    <Card className="p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Photos</p><h2 className="sf-section-title mt-2">Add the moments</h2><p className="sf-body-secondary mt-2">JPEG, PNG, or WebP · up to {MAX_PHOTOS_PER_UPLOAD} photos · {Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB each</p></div><span className="sf-caption">Originals stay private until publication rules are satisfied.</span></div>
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} className="mt-6 block cursor-pointer rounded-[var(--radius-medium)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-interactive)] p-8 text-center transition-colors hover:border-[var(--accent)] focus-within:border-[var(--accent)]"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-2xl text-white">↑</span><span className="mt-4 block font-bold">Drop photos here or browse files</span><span className="sf-body-secondary mt-2 block">Select a batch and set one inherited price for every photo.</span><input name="photos" type="file" multiple accept={supportedMimeTypes.join(",")} onChange={(event) => choose(event.target.files)} className="sr-only" /></label>
      {files.length > 0 && <div className="mt-5 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] p-4"><p className="sf-label">Selected files</p><p className="mt-2 font-display text-2xl font-extrabold">{files.length} photos <span className="text-base font-medium text-[var(--text-secondary)]">· {totalLabel}</span></p><ul className="mt-3 grid gap-1 text-sm text-[var(--text-secondary)]">{files.slice(0, 5).map((file) => <li key={`${file.name}-${file.size}`} className="truncate">{file.name}</li>)}{files.length > 5 && <li>+ {files.length - 5} more</li>}</ul></div>}
    </Card>
    <Card className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><Input id="upload-price" name="priceDollars" label={`Price per photo (USD)${selectedAlbum ? ` · ${selectedAlbum.title}` : ""}`} required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" value={price} onChange={(event) => setPrice(event.target.value)} /><div><Button type="submit" loading={busy} disabled={busy || files.length === 0}>Upload photos</Button></div></div><p className="sf-caption mt-4">Photos inherit this album price. You can add individual overrides later from album management.</p>{message && <p role="status" className="mt-4 text-sm text-[var(--error)]">{message}</p>}</Card>
  </form>;
}
