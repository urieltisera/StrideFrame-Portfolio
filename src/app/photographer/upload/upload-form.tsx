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
  const albumOptions = events.flatMap((event) => event.albums.filter((album) => album.title !== "Individual photos").map((album) => ({ ...album, eventId: event.id, eventTitle: event.title })));
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

  function selectAlbum(value: string) {
    setAlbumId(value);
    const album = albumOptions.find((item) => item.id === value);
    if (album) {
      setEventChoice(album.eventId);
      setPrice((album.priceCents / 100).toFixed(2));
    }
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
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Photos</p><h2 className="sf-section-title mt-2">Add the moments</h2><p className="sf-body-secondary mt-2">Select up to {MAX_PHOTOS_PER_UPLOAD} JPEG, PNG, or WebP photos.</p></div><span className="sf-caption">Originals stay private until publication.</span></div>
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} className="mt-6 block cursor-pointer rounded-[var(--radius-medium)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-interactive)] p-8 text-center transition-colors hover:border-[var(--accent)] focus-within:border-[var(--accent)]"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-2xl text-white">↑</span><span className="mt-4 block font-bold">Drop photos here or browse files</span><span className="sf-body-secondary mt-2 block">Choose a batch. You can organize it into an album below.</span><input name="photos" type="file" multiple accept={supportedMimeTypes.join(",")} onChange={(event) => choose(event.target.files)} className="sr-only" /></label>
      {files.length > 0 && <div className="mt-5 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] p-4"><p className="sf-label">Selected files</p><p className="mt-2 font-display text-2xl font-extrabold">{files.length} photos <span className="text-base font-medium text-[var(--text-secondary)]">· {totalLabel}</span></p><ul className="mt-3 grid gap-1 text-sm text-[var(--text-secondary)]">{files.slice(0, 5).map((file) => <li key={`${file.name}-${file.size}`} className="truncate">{file.name}</li>)}{files.length > 5 && <li>+ {files.length - 5} more</li>}</ul></div>}
    </Card>
    <Card className="p-6 md:p-8">
      <p className="sf-label text-[var(--accent)]">Organization</p><h2 className="sf-section-title mt-2">Album <span className="font-normal text-[var(--text-muted)]">(optional)</span></h2><p className="sf-body-secondary mt-2">Choose a collection or keep these photos in General photos.</p>
      <label htmlFor="upload-album" className="mt-5 grid gap-2"><span className="sf-label">Album</span><select id="upload-album" name="albumId" value={albumId} onChange={(event) => selectAlbum(event.target.value)} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"><option value="">General photos{selectedEvent ? ` · ${selectedEvent.title}` : ""}</option>{albumOptions.map((album) => <option key={album.id} value={album.id}>{album.title} · {album.eventTitle}</option>)}</select></label>
      <div className="mt-5 border-t border-[var(--border)] pt-5"><label htmlFor="upload-event" className="grid gap-2"><span className="sf-label">Gallery context</span><select id="upload-event" name="eventId" value={eventChoice} onChange={(event) => selectEvent(event.target.value)} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"><option value="__new__">Create a new gallery</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p className="sf-caption mt-2">Used for secure routing when General photos is selected. You do not need to publish the gallery before uploading.</p></div>
      {eventChoice === "__new__" && <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 md:grid-cols-2"><Input id="event-title" name="eventTitle" label="New gallery name" required placeholder="Saturday race" /><label htmlFor="event-description" className="grid gap-2"><span className="sf-label">Description <span className="font-normal normal-case tracking-normal">(optional)</span></span><textarea id="event-description" name="eventDescription" rows={2} className="min-h-11 rounded-[var(--radius-small)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" placeholder="A short description" /></label><p className="sf-caption md:col-span-2">The gallery stays private as a draft until you publish it.</p></div>}
    </Card>
    <Card className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><Input id="upload-price" name="priceDollars" label={`Price per photo (USD)${selectedAlbum ? ` · ${selectedAlbum.title}` : ""}`} required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" value={price} onChange={(event) => setPrice(event.target.value)} /><div><Button type="submit" loading={busy} disabled={busy || files.length === 0}>Upload photos</Button></div></div><p className="sf-caption mt-4">Photos inherit this price. Individual overrides can be added later from album management.</p>{message && <p role="status" className="mt-4 text-sm text-[var(--error)]">{message}</p>}</Card>
  </form>;
}
