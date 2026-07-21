// Resolves the student portal's org at the request boundary. Students are
// org-scoped: the login (session) is global, but the portal entry point supplies
// which org's "world" the request belongs to. The student app forwards the org
// slug via the `x-portal-org` header; dev falls back to `PORTAL_ORG_SLUG`.
import type { FastifyRequest } from "fastify";
import type { Container } from "../composition/container.js";
import type { Organization } from "../core/organizations/index.js";

/** Thrown when the portal org slug is missing or does not resolve. Mapped to 400. */
export class UnknownPortalOrgError extends Error {}

const PORTAL_ORG_HEADER = "x-portal-org";

function readSlug(req: FastifyRequest): string | undefined {
  const header = req.headers[PORTAL_ORG_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromHeader?.trim() || process.env.PORTAL_ORG_SLUG?.trim() || undefined;
}

/** Resolve the portal org slug (header, else env) to the tenant org record. */
export async function resolvePortalOrgRecord(
  container: Container,
  req: FastifyRequest,
): Promise<Organization> {
  const slug = readSlug(req);
  if (!slug) throw new UnknownPortalOrgError("no portal org slug supplied");
  const org = await container.organizations.getBySlug(slug);
  if (!org) throw new UnknownPortalOrgError(`unknown portal org "${slug}"`);
  return org;
}

/** Resolve the portal org to its tenant `organizations.id`. */
export async function resolvePortalOrg(container: Container, req: FastifyRequest): Promise<string> {
  return (await resolvePortalOrgRecord(container, req)).id;
}
