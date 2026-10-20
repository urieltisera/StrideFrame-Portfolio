"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ReactNode } from "react";
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

  return <div className="sf-sport-card relative isolate aspect-[4/5] min-h-[360px] w-full max-w-[24rem] justify-self-end overflow-hidden bg-[var(--secondary-dark)] md:min-h-0" aria-label="Sports photography preview">
    {LANDING_SPORTS.map((sport, index) => <div key={sport.id} className={`sf-sport-layer absolute inset-0 ${index === activeSport ? "is-active" : ""}`} aria-hidden="true">
      {sport.src || fallbackSrc ? <SafeImage src={sport.src ?? fallbackSrc} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" style={{ objectPosition: sport.id === "motorsport" ? "58% 40%" : "50% 42%" }} className="h-full w-full object-cover" /> : <div className={`sf-sport-fallback sf-sport-fallback-${sport.id} h-full w-full`} />}
    </div>)}
    <div className="sf-sport-overlay absolute inset-0" />
    <div className="relative z-10 flex h-full flex-col justify-end p-6 md:p-9">
      <div>
        <p className="sf-kicker text-white/70">{LANDING_SPORTS[activeSport].label} / StrideFrame</p>
      </div>
      <div><p className="sf-kicker text-[var(--orange)]">Find. Choose. Own.</p><p className="mt-3 max-w-sm text-xl font-bold leading-tight text-white/90">The right photograph turns a result into a memory.</p></div>
    </div>
  </div>;
}

export function PhotographerHero({ children }: { children: ReactNode }) {
  return <section className="sf-photographer-hero relative isolate overflow-hidden bg-[var(--ink)] text-white">
    <div className="sf-photographer-hero-panels absolute inset-0" aria-hidden="true">
      {LANDING_SPORTS.map((sport, index) => <div className="sf-photographer-hero-panel" key={sport.id}><SafeImage src={sport.src ?? sport.requiredPath} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" /></div>)}
    </div>
    <div className="sf-photographer-hero-overlay absolute inset-0" />
    <div className="relative z-10 flex min-h-[inherit] items-center">{children}</div>
  </section>;
}

type MotionStep = { number: string; title: string; copy: string };

const steps: readonly MotionStep[] = [
  { number: "01", title: "Find", copy: "Start with a published gallery from your race or event." },
  { number: "02", title: "Choose", copy: "Browse the moments that feel like yours." },
  { number: "03", title: "Own", copy: "Keep the photographs that tell the story." },
];

function StaggeredSteps({ steps, columns, spacing = "mt-6", itemClassName = "" }: { steps: readonly MotionStep[]; columns: string; spacing?: string; itemClassName?: string }) {
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.dataset.motionReady = "true";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      group.dataset.revealed = "true";
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      group.dataset.revealed = "true";
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  return <div ref={groupRef} className={`sf-reveal-group ${spacing} grid gap-8 ${columns}`} data-motion-ready="false" data-revealed="false">
    {steps.map((step, index) => <div className={`sf-reveal-item ${itemClassName}`} style={{ "--sf-reveal-delay": `${index * 120}ms` } as CSSProperties} key={step.number}>
      <div className="sf-step-mark" aria-hidden="true"><span>{step.number}</span></div>
      <div className="sf-step-copy"><h2 className="mt-4 font-display text-xl font-extrabold">{step.title}</h2><p className="sf-body-secondary mt-2">{step.copy}</p></div>
    </div>)}
  </div>;
}

export function LandingHowItWorks() {
  return <section className="border-y border-[var(--border)] bg-[var(--surface)]">
    <div className="mx-auto max-w-7xl px-5 py-14 md:px-10">
      <p className="sf-kicker">How it works</p>
      <StaggeredSteps steps={steps} columns="md:grid-cols-3" />
    </div>
  </section>;
}

const photographerSteps: readonly MotionStep[] = [
  { number: "01", title: "UPLOAD", copy: "Bring your photographs into one focused workspace." },
  { number: "02", title: "CREATE ALBUM", copy: "Turn a selection into a collection customers can browse." },
  { number: "03", title: "PUBLISH", copy: "Release the work when it is ready to share." },
  { number: "04", title: "SHARE", copy: "Give customers a QR code or link to find the gallery." },
];

export function PhotographerProcess() {
  return <StaggeredSteps steps={photographerSteps} spacing="mt-12" columns="sm:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)]" itemClassName="bg-[var(--surface)] p-6 md:p-7" />;
}
