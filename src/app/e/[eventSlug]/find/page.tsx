"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState, ErrorState } from "@/components/feedback";
import { SearchResults } from "@/components/search-results";

export default function FindPhotos({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = use(params);
  const [faceSearchAvailable, setFaceSearchAvailable] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);
  const [results, setResults] = useState<Parameters<typeof SearchResults>[0]["photos"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/events/${eventSlug}/face-search`)
      .then((response) => response.json())
      .then((data) => setFaceSearchAvailable(data.available === true))
      .catch(() => setFaceSearchAvailable(false));
  }, [eventSlug]);

  async function search(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (!consentGiven) {
      setError("Please acknowledge the Face Search privacy notice before continuing.");
      return;
    }
    if (!faceSearchAvailable) {
      setError("Face Search is currently unavailable for this event.");
      return;
    }
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch(`/api/events/${eventSlug}/face-search`, { method: "POST", body: new FormData(form.currentTarget) });
      const data = await response.json();
      if (!response.ok) setError(data.error || "Face search failed");
      else setResults(data.results || []);
    } catch {
      setError("The search could not be completed. Please try again or browse the gallery.");
    } finally {
      setBusy(false);
    }
  }

  return <CustomerShell><div className="mx-auto max-w-5xl">
    <Link href={`/e/${eventSlug}`} className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back to event</Link>
    <div className="mt-10 max-w-3xl"><p className="sf-label text-[var(--accent)]">Find my photos</p><h1 className="sf-page-title mt-3">Your race day, found.</h1><p className="sf-body-secondary mt-4 text-lg">Upload a clear selfie and we’ll look for visually similar photos in this event. We don’t identify you by name.</p></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="p-5 sm:p-8"><form onSubmit={search} className="grid gap-5">
        <label htmlFor="selfie" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && inputRef.current) { const transfer = new DataTransfer(); transfer.items.add(file); inputRef.current.files = transfer.files; setFileName(file.name); } }} className="group grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-elevated)] px-5 py-12 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-interactive)]"><span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-interactive)] text-2xl text-[var(--accent)]">↑</span><span className="mt-4 font-bold">{fileName || "Upload a clear photo of your face"}</span><span className="sf-caption mt-2">Drop an image here or choose a file · JPG, PNG or WebP</span><input ref={inputRef} id="selfie" name="selfie" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} className="sr-only" /></label>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm"><p className="font-bold">Product/privacy notice</p><p className="mt-2 text-[var(--text-secondary)]">Face Search is optional. StrideFrame creates a temporary biometric representation from your photo to look for matches only in this event. The query image and representation are not intended for durable storage. You can browse all photos without using Face Search.</p><label className="mt-4 flex cursor-pointer items-start gap-3 font-semibold"><input name="faceSearchConsent" value="accepted" type="checkbox" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} disabled={!faceSearchAvailable} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /> <span>I understand and want to use Face Search.</span></label></div>
        <div className="flex flex-wrap items-center justify-between gap-4"><p className="sf-caption max-w-md">{faceSearchAvailable ? "Your selfie is processed for this event search only and is not saved to public storage. Face Search is currently a development validation feature." : "Face Search is currently unavailable for this event. You can browse the event manually instead."}</p><Button type="submit" loading={busy} disabled={!faceSearchAvailable || !consentGiven}>{busy ? "Finding your photos" : faceSearchAvailable ? "Find my photos" : "Face Search unavailable"}</Button></div>
      </form></Card>
      <Card className="h-fit bg-[var(--navy)] p-6 text-white"><p className="text-3xl text-[#b8aaff]">✦</p><h2 className="mt-8 text-xl font-black">For the best matches</h2><ul className="mt-4 grid gap-3 text-sm leading-relaxed text-white/70"><li>✓ Face the camera directly</li><li>✓ Use good, even lighting</li><li>✓ Avoid sunglasses or hats</li><li>✓ Include one person only</li></ul></Card>
    </div>
    {error && <div className="mt-5"><ErrorState title="Search unavailable" description={error} action={<button type="button" onClick={() => setError("")} className="text-sm font-bold text-[var(--accent)]">Dismiss</button>} /></div>}
    {results.length > 0 ? <SearchResults photos={results} /> : !error && !busy && <div className="mt-8"><EmptyState title="Ready when you are" description="Your possible matches will appear here after you upload a selfie." action={<Link href={`/e/${eventSlug}`} className="text-sm font-bold text-[var(--accent)]">Browse the event manually →</Link>} /></div>}
  </div></CustomerShell>;
}
