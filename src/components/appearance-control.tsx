"use client";

import { updateAppearance } from "@/app/photographer/actions";

type Appearance = "BLACK" | "DARK" | "LIGHT";
const choices: Array<{ value: Appearance; label: string; description: string }> = [
  { value: "BLACK", label: "Black", description: "Near-black photography mode" },
  { value: "DARK", label: "Dark", description: "Deep Ink workspace" },
  { value: "LIGHT", label: "Light", description: "Warm editorial workspace" },
];
export function AppearanceControl({ appearance }: { appearance: Appearance }) {

  return <div className="grid gap-3" role="group" aria-labelledby="appearance-label">
    <div>
      <p id="appearance-label" className="sf-label">Appearance</p>
      <p className="sf-caption mt-1">Choose your workspace surface.</p>
    </div>
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="appearance-label">
      {choices.map((choice) => <form key={choice.value} action={updateAppearance}><input type="hidden" name="appearanceTheme" value={choice.value} /><button type="submit" role="radio" aria-checked={appearance === choice.value} title={choice.description} className={`min-h-10 w-full rounded-[var(--radius-medium)] border px-3 py-2 text-sm font-bold transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${appearance === choice.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "border-[var(--border)] bg-[var(--surface-interactive)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}>{choice.label}</button></form>)}
    </div>
  </div>;
}
