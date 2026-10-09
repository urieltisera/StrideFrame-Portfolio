export function ownsResource(resource: { photographerId: string } | null | undefined, photographerId: string) { return Boolean(resource && resource.photographerId === photographerId); }
export function requireOwner(resource: { photographerId: string } | null | undefined, photographerId: string) { if (!ownsResource(resource, photographerId)) throw new Error("FORBIDDEN"); return resource; }
