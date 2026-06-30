// HTTP routes for the assets media library + content delivery. All require a
// session with an active organization; assets are stored under the org's
// private prefix and served only through short-lived presigned URLs.
//
// The session carries the better-auth (active) organization id; org-scoped
// tables key on the domain organization id, so each handler resolves one to the
// other (same pattern the auth adapter uses for user → student).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  Asset,
  AssetIdParam,
  AssetsPage,
  AssetsQuery,
  DownloadTicket,
  ErrorBody,
  RequestDownload,
  RequestUpload,
  UploadTicket,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";

/** Resolve the session's active org to the domain org id, or 400 and return null. */
async function resolveOrgId(
  req: FastifyRequest,
  reply: FastifyReply,
  container: Container,
): Promise<string | null> {
  if (!req.orgId) {
    await reply.code(400).send({ error: "no_active_org", message: "No active organization" });
    return null;
  }
  const org = await container.organizations.getByExternalId(req.orgId);
  if (!org) {
    await reply.code(400).send({ error: "no_active_org", message: "Organization not provisioned" });
    return null;
  }
  return org.id;
}

export async function assetsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const assets = container.assets;
  const tags = ["Assets"];

  // Register an asset + get a presigned upload URL. Kept at /api/uploads as the
  // "start an upload" action; the resulting asset lives in the library below.
  r.route({
    method: "POST",
    url: "/api/uploads",
    preHandler: app.requireSession,
    schema: {
      operationId: "requestUpload",
      tags,
      summary: "Register an asset and get a presigned upload URL",
      body: RequestUpload,
      response: { 201: UploadTicket, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      const ticket = await assets.requestUpload(orgId, {
        uploadedBy: req.authUser?.id ?? "",
        ...req.body,
      });
      return reply.code(201).send(ticket);
    },
  });

  r.route({
    method: "POST",
    url: "/api/assets/:id/confirm",
    preHandler: app.requireSession,
    schema: {
      operationId: "confirmAsset",
      tags,
      summary: "Confirm an upload completed (captures size + content type)",
      params: AssetIdParam,
      response: { 200: Asset, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      const asset = await assets.confirm(orgId, req.params.id);
      if (!asset) return reply.code(404).send({ error: "not_found", message: "Asset not found" });
      return asset;
    },
  });

  r.route({
    method: "GET",
    url: "/api/assets",
    preHandler: app.requireSession,
    schema: {
      operationId: "listAssets",
      tags,
      summary: "Browse the organization's media library",
      querystring: AssetsQuery,
      response: { 200: AssetsPage, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      return assets.list(orgId, req.query);
    },
  });

  r.route({
    method: "GET",
    url: "/api/assets/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "getAsset",
      tags,
      summary: "Get an asset's metadata",
      params: AssetIdParam,
      response: { 200: Asset, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      const asset = await assets.get(orgId, req.params.id);
      if (!asset) return reply.code(404).send({ error: "not_found", message: "Asset not found" });
      return asset;
    },
  });

  r.route({
    method: "POST",
    url: "/api/assets/:id/download-url",
    preHandler: app.requireSession,
    schema: {
      operationId: "requestAssetDownload",
      tags,
      summary: "Get a short-lived presigned URL to download/serve an asset",
      params: AssetIdParam,
      body: RequestDownload,
      response: { 200: DownloadTicket, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      const ticket = await assets.requestDownload(orgId, req.params.id, req.body.filename);
      if (!ticket) return reply.code(404).send({ error: "not_found", message: "Asset not found" });
      return ticket;
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/assets/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteAsset",
      tags,
      summary: "Delete an asset (removes the object from storage)",
      params: AssetIdParam,
      response: { 204: z.void(), 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) return;
      const removed = await assets.remove(orgId, req.params.id);
      if (!removed) return reply.code(404).send({ error: "not_found", message: "Asset not found" });
      return reply.code(204).send();
    },
  });
}
