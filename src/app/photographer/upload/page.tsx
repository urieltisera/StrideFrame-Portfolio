import { redirect } from "next/navigation";
import { PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UploadWorkflow } from "./upload-form";

export default async function UploadPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const events = await prisma.event.findMany({ where: { photographerId: person.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, albums: { where: { photographerId: person.id }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, priceCents: true, status: true } } } });
  return <PhotographerShell active="upload" accountName={person.name}><PageHeader eyebrow="Photographer workspace" title="Upload photos" description="Choose an event, add a batch, and set one price per photo. Publication stays in your control." /><div className="mt-8"><UploadWorkflow events={events} /></div></PhotographerShell>;
}
