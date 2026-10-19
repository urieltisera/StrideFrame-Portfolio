"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LANDING_SPORTS } from "@/lib/landing-visuals";
import { SafeImage } from "./safe-image";

export function LandingSportCard({ fallbackSrc }: { fallbackSrc?: string }) {
  const [activeSport, setActiveSport] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;
    const interval = window.setInterval(() => setActiveSport((current) => (current + 1) % LANDING_SPORTS.length), 9000);
    return () => window.clearInterval(interval);
  }, []);

  return <div className="sf-sport-card relative isolate min-h-[300px] overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--secondary-dark)] md:min-h-[390px]" aria-label="Sports photography preview">
    {LANDING_SPORTS.map((sport, index) => <div key={sport.id} className={`sf-sport-layer absolute inset-0 ${index === activeSport ? "is-active" : ""}`} aria-hidden="true">
      {sport.src || fallbackSrc ? <SafeImage src={sport.src ?? fallbackSrc} alt="" className="h-full w-full object-cover" /> : <div className={`sf-sport-fallback sf-sport-fallback-${sport.id} h-full w-full`} />}
    </div>)}
    <div className="sf-sport-overlay absolute inset-0" />
    <div className="relative z-10 flex h-full min-h-[300px] flex-col justify-between p-7 md:min-h-[390px] md:p-9">
      <div className="flex items-center justify-between gap-4"><p className="sf-kicker text-white/70">{LANDING_SPORTS[activeSport].label} / StrideFrame</p><span className="sf-sport-index text-xs font-bold tabular-nums text-white/60">0{activeSport + 1} / 03</span></div>
      <div><p className="sf-kicker text-[var(--orange)]">Find. Choose. Own.</p><p className="mt-3 max-w-sm text-xl font-bold leading-tight text-white/90">The right photograph turns a result into a memory.</p></div>
    </div>
  </div>;
}

const steps = [
  { number: "01", title: "Find", copy: "Start with a published gallery from your race or event." },
  { number: "02", title: "Choose", copy: "Browse the moments that feel like yours." },
  { number: "03", title: "Own", copy: "Keep the photographs that tell the story." },
] as const;

export function LandingHowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    element.dataset.motionReady = "true";
    if (!("IntersectionObserver" in window)) {
      element.dataset.revealed = "true";
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRevealed(true);
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <section ref={sectionRef} className="border-y border-[var(--border)] bg-[var(--surface)]" data-motion-ready="false" data-revealed={revealed}>
    <div className="mx-auto max-w-7xl px-5 py-14 md:px-10">
      <p className="sf-kicker">How it works</p>
      <div className="sf-reveal-group mt-6 grid gap-8 md:grid-cols-3">
        {steps.map((step, index) => <div className="sf-reveal-item" style={{ "--sf-reveal-delay": `${index * 120}ms` } as CSSProperties} key={step.number}>
          <div className={`sf-step-mark sf-step-mark-${index + 1}`} aria-hidden="true"><span>{step.number}</span></div>
          <h2 className="mt-4 text-xl font-bold">{step.title}</h2>
          <p className="sf-body-secondary mt-2">{step.copy}</p>
        </div>)}
      </div>
    </div>
  </section>;
}
