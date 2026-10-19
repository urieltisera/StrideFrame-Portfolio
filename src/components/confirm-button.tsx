"use client";

import { Button } from "./button";
import type { ReactNode } from "react";

export function ConfirmButton({ message, children, variant = "destructive" }: { message: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "destructive" }) {
  return <Button type="submit" variant={variant} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</Button>;
}
