// HTTP routes for the team (org members) context. Reads from the domain mirror;
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
import { TeamRuleError, type TeamWriteContext } from "../../core/team/index.js";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function teamRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const team = container.team;

  r.route({
    method: "GET",
    url: "/api/team",
    preHandler: app.requireSession,
    schema: {
      operationId: "listMembers",
      tags: ["Team"],
      summary: "List team members",
      querystring: MembersQuery,
      response: { 200: MembersPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return team.list(scope.orgId, req.query);
    },
  });

  r.route({
    method: "POST",
    url: "/api/team",
    preHandler: app.requireSession,
    schema: {
      operationId: "inviteMember",
      tags: ["Team"],
      summary: "Invite a team member",
      body: InviteMember,
      response: { 201: Member, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: TeamWriteContext = { orgId: scope.orgId, authOrgId: scope.authOrgId, headers: req.headers };
      try {
        const member = await team.invite(ctx, req.body);
        return reply.code(201).send(member);
      } catch (err) {
        if (err instanceof TeamRuleError) return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/team/:id/role",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateMemberRole",
      tags: ["Team"],
      summary: "Change a member's role",
      params: MemberIdParam,
      body: UpdateMemberRole,
      response: { 200: Member, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: TeamWriteContext = { orgId: scope.orgId, authOrgId: scope.authOrgId, headers: req.headers };
      try {
        const member = await team.updateRole(ctx, req.params.id, req.body.role);
        if (!member) return reply.code(404).send({ error: "not_found", message: "Member not found" });
        return member;
      } catch (err) {
        if (err instanceof TeamRuleError) return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/team/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "removeMember",
      tags: ["Team"],
      summary: "Remove a team member",
      params: MemberIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: TeamWriteContext = { orgId: scope.orgId, authOrgId: scope.authOrgId, headers: req.headers };
      try {
        const removed = await team.remove(ctx, req.params.id);
        if (!removed) return reply.code(404).send({ error: "not_found", message: "Member not found" });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof TeamRuleError) return reply.code(409).send({ error: "conflict", message: err.message });
        throw err;
      }
    },
  });
}
