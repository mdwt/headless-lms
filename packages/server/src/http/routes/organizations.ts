// HTTP routes for the organizations resource: creating an org, and managing its
// members (a sub-resource, under /api/organizations/members). Member reads come
// from the domain mirror; org/member writes go through Better Auth (the org
// provider). Member routes are org-scoped via the session.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateOrganization,
  ErrorBody,
  InviteMember,
  Member,
  MemberIdParam,
  MembersPage,
  MembersQuery,
  Organization,
  UpdateMemberRole,
  UpdateOrganization,
} from "@headless-lms/api-contract";
import { OrganizationRuleError, type MemberWriteContext } from "../../core/organizations/index.js";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function organizationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const organizations = container.organizations;
  const tags = ["Organizations"];

  // Create a new organization on the caller's behalf and make it their active
  // org. This is the API's own front door for org creation — it drives Better
  // Auth internally, so callers use the typed SDK, not the auth namespace. No
  // resolveScope here: the caller has no active org yet, only a session.
  r.route({
    method: "POST",
    url: "/api/organizations",
    preHandler: app.requireSession,
    schema: {
      operationId: "createOrganization",
      tags,
      summary: "Create an organization and make it active",
      body: CreateOrganization,
      response: { 201: Organization },
    },
    handler: async (req, reply) => {
      const org = await organizations.createOrganization(req.headers, req.body);
      return reply.code(201).send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  // Update the caller's active organization (name/slug). Writes go through Better
  // Auth, which enforces the caller's org-update permission (owner/admin).
  r.route({
    method: "PATCH",
    url: "/api/organizations",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateOrganization",
      tags,
      summary: "Update the active organization",
      body: UpdateOrganization,
      response: { 200: Organization, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      try {
        const org = await organizations.updateOrganization(req.headers, scope.authOrgId, req.body);
        return reply.send({
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt.toISOString(),
        });
      } catch (err) {
        if (err instanceof OrganizationRuleError)
          return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });

  r.route({
    method: "GET",
    url: "/api/organizations/members",
    preHandler: app.requireSession,
    schema: {
      operationId: "listMembers",
      tags,
      summary: "List organization members",
      querystring: MembersQuery,
      response: { 200: MembersPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return organizations.listMembers(scope.orgId, req.query);
    },
  });

  r.route({
    method: "POST",
    url: "/api/organizations/members",
    preHandler: app.requireSession,
    schema: {
      operationId: "inviteMember",
      tags,
      summary: "Invite an organization member",
      body: InviteMember,
      response: { 201: Member, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      try {
        const member = await organizations.inviteMember(ctx, req.body);
        return reply.code(201).send(member);
      } catch (err) {
        if (err instanceof OrganizationRuleError)
          return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/organizations/members/:id/role",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateMemberRole",
      tags,
      summary: "Change a member's role",
      params: MemberIdParam,
      body: UpdateMemberRole,
      response: { 200: Member, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      try {
        const member = await organizations.updateMemberRole(ctx, req.params.id, req.body.role);
        if (!member)
          return reply.code(404).send({ error: "not_found", message: "Member not found" });
        return member;
      } catch (err) {
        if (err instanceof OrganizationRuleError)
          return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/organizations/members/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "removeMember",
      tags,
      summary: "Remove an organization member",
      params: MemberIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      try {
        const removed = await organizations.removeMember(ctx, req.params.id);
        if (!removed)
          return reply.code(404).send({ error: "not_found", message: "Member not found" });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof OrganizationRuleError)
          return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });
}
