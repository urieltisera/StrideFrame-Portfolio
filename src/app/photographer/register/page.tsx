import Link from "next/link";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/form-fields";
import { register } from "@/app/photographer/actions";
import { BrandLogo } from "@/components/brand";

export default function Register() {
  return <main className="sf-auth-page sf-auth-visual flex min-h-screen items-center justify-center px-5 py-10"><Card className="w-full max-w-md p-7 shadow-[var(--shadow-elevated)] sm:p-9"><div className="mb-10 flex justify-center"><BrandLogo href="/" light /></div><Link href="/" className="text-sm font-semibold text-[var(--text-secondary)]">← Back to StrideFrame</Link><p className="sf-label mt-12 text-[var(--accent)]">Photographer account</p><h1 className="sf-page-title mt-3">Create your workspace.</h1><p className="sf-body-secondary mt-4">Upload photos, create albums and share your work with customers.</p><form action={register} className="mt-8 grid gap-4"><Input id="register-name" name="name" label="Full name" required autoComplete="name" placeholder="Alex Johnson" /><Input id="register-email" name="email" label="Email" required type="email" autoComplete="email" placeholder="you@example.com" /><Input id="register-password" name="password" label="Password" required minLength={8} type="password" autoComplete="new-password" placeholder="At least 8 characters" /><Button type="submit" className="mt-3 w-full">Create account</Button></form><p className="sf-caption mt-6">By creating an account you can manage photos, albums and protected previews.</p><p className="sf-body-secondary mt-6 border-t border-[var(--border)] pt-6">Already have an account? <Link href="/photographer/login" className="font-bold text-[var(--accent)]">Sign in →</Link></p></Card></main>;
}
