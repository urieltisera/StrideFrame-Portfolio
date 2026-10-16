"use client";
import { useState } from "react";
import { Button } from "@/components/button";

export function CopyProfileLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy link"}</Button>;
}
