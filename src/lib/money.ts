import { z } from "zod";
const dollars = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid USD amount with at most 2 decimals");
export function dollarsToCents(value: string) { const parsed=dollars.parse(value); const [whole,fraction=""] = parsed.split("."); return Number(whole)*100 + Number(fraction.padEnd(2,"0")); }
export function formatUsd(cents:number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100); }
