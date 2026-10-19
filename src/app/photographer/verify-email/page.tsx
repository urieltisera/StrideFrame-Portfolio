import Link from "next/link";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input } from "@/components/form-fields";
import { resendVerification } from "@/app/photographer/actions";
import { verifyEmailToken } from "@/lib/email";

function copyFor(result?: string) {
  if (result === "verified") return ["Email verified.", "Your photographer account is ready. Sign in to continue."];
  if (result === "expired") return ["This link has expired.", "Request a new verification email below."];
  if (result === "used") return ["This link has already been used.", "Your account may already be verified. Try signing in."];
  if (result === "invalid") return ["This verification link is not valid.", "Request a new verification email below."];
  return ["Check your email.", "Verify your email address before entering the photographer workspace."];
}

export default async function VerifyEmailPage({ searchParams }: { searchParams?: Promise<{ token?: string; result?: string; error?: string; resent?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const result = query.token ? await verifyEmailToken(query.token) : query.result;
  const [title, description] = copyFor(result);
  return <main className="sf-auth-page flex min-h-screen items-center justify-center px-5 py-10"><Card className="w-full max-w-md p-7 shadow-[var(--shadow-elevated)] sm:p-9"><p className="sf-label text-[var(--accent)]">Photographer account</p><h1 className="sf-page-title mt-3">{title}</h1><p className="sf-body-secondary mt-4">{description}</p>{query.resent && <p role="status" className="mt-5 text-sm font-semibold text-[var(--accent)]">If the account is eligible, a new message has been requested.</p>}{result !== "verified" && <form action={resendVerification} className="mt-8 grid gap-4"><Input id="verification-email" name="email" label="Account email" type="email" required autoComplete="email" /><Button type="submit">Resend verification</Button></form>}<div className="mt-7 flex flex-wrap gap-4 border-t border-[var(--border)] pt-6 text-sm font-bold"><Link href="/photographer/login" className="text-[var(--accent)]">Sign in</Link><Link href="/" className="text-[var(--text-secondary)]">Back to StrideFrame</Link></div></Card></main>;
}
