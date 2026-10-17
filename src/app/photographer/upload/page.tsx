import { redirect } from "next/navigation";
import { PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { getCurrentPhotographer } from "@/lib/auth";
import { UploadWorkflow } from "./upload-form";

export default async function UploadPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  return <PhotographerShell active="upload" accountName={person.name}><PageHeader eyebrow="Photographer workspace" title="Upload photos" description="Add a batch to your library. Organize and publish it when you are ready." /><div className="mt-8"><UploadWorkflow /></div></PhotographerShell>;
}
