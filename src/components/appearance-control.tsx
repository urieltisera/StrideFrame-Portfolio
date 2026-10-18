"use client";

import { useSyncExternalStore } from "react";

type Appearance = "light" | "dark" | "black";
const STORAGE_KEY = "strideframe-photographer-appearance";
const choices: Array<{ value: Appearance; label: string; description: string }> = [
  { value: "light", label: "Light", description: "Warm editorial workspace" },
  { value: "dark", label: "Dark", description: "Deep Ink workspace" },
  { value: "black", label: "Black", description: "Near-black photography mode" },
];

function applyAppearance(value: Appearance) {
  const shell = document.querySelector<HTMLElement>("[data-photographer-shell]");
  if (shell) shell.dataset.appearance = value;
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event("strideframe-appearance"));
}

function readAppearance(): Appearance {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "black" ? saved : "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("strideframe-appearance", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("strideframe-appearance", onChange);
  };
}

export function AppearanceControl() {
  const appearance = useSyncExternalStore(subscribe, readAppearance, () => "dark");

  function select(value: Appearance) {
    applyAppearance(value);
  }

  return <div className="grid gap-3" role="group" aria-labelledby="appearance-label">
    <div>
      <p id="appearance-label" className="sf-label">Appearance</p>
      <p className="sf-caption mt-1">Choose your workspace surface.</p>
    </div>
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="appearance-label">
      {choices.map((choice) => <button key={choice.value} type="button" role="radio" aria-checked={appearance === choice.value} title={choice.description} onClick={() => select(choice.value)} className={`min-h-10 rounded-[var(--radius-medium)] border px-3 py-2 text-sm font-bold transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${appearance === choice.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "border-[var(--border)] bg-[var(--surface-interactive)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}>{choice.label}</button>)}
    </div>
  </div>;
}
