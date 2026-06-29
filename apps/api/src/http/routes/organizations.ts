// HTTP routes for organization member management. Reads from the domain mirror;
// writes go through Better Auth (org provider). Org-scoped via the session.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ErrorBody,
  InviteMember,
  Member,
  MemberIdParam,
  MembersPage,
  MembersQuery,
  UpdateMemberRole,
} from "@headless-lms/api-contract";
import { OrganizationRuleError, type MemberWriteContext } from "../../core/organizations/index.js";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function organizationsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const organizations = container.organizations;
  const tags = ["Organizations"];

  r.route({
    method: "GET",
    url: "/api/members",
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
    url: "/api/members",
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
    url: "/api/members/:id/role",
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
        if (!member) return reply.code(404).send({ error: "not_found", message: "Member not found" });
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
    url: "/api/members/:id",
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
        if (!removed) return reply.code(404).send({ error: "not_found", message: "Member not found" });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof OrganizationRuleError)
          return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });
}
