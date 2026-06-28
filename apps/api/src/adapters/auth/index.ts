// Auth adapter — wraps better-auth. Runtime/infra only; never imported by core.
//
// It depends on core ports (an EmailSender, the identity service, and the
// organizations provisioner) and owns the translation between better-auth's
// shapes and those ports: the magic-link email body, mapping a new credential
// user to a domain student, and mirroring the organization plugin's records
// (org, members, invitations) into the organizations context. Crucially, this
// adapter resolves better-auth user ids to domain student ids before calling
// core, so core contexts never import the auth schema. Composition only injects
// the port implementations.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { EmailSender } from "../../core/shared/ports.js";
import type { IdentityService } from "../../core/identity/index.js";
import type { OrganizationProvisioner } from "../../core/organizations/index.js";
import * as authSchema from "./schema.js";
import { ac, roles } from "./access.js";

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  /** Sends transactional auth emails (e.g. the magic-link sign-in email). */
  email: EmailSender;
  /** Provisions a domain student and resolves auth users to students. */
  identity: IdentityService;
  /** Mirrors the organization plugin's records into the domain. */
  organizations: OrganizationProvisioner;
}

export function createAuth(opts: CreateAuthOptions) {
  // Resolve a better-auth user id to its mirrored domain student. The student is
  // provisioned on user creation, so it exists by the time org hooks fire.
  const requireStudent = async (authUserId: string) => {
    const student = await opts.identity.getStudentByAuthUserId(authUserId);
    if (!student) throw new Error(`no domain student for auth user ${authUserId}`);
    return student;
  };

  return betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await opts.email.send({
            to: email,
            subject: "Your sign-in link",
            text: `Click to sign in: ${url}`,
          });
        },
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        organizationHooks: {
          // New org → mirror it plus the creator's owner membership.
          afterCreateOrganization: async ({ organization: org, member, user }) => {
            const owner = await requireStudent(user.id);
            await opts.organizations.provisionOrganization({
              authOrgId: org.id,
              name: org.name,
              slug: org.slug,
              ownerStudentId: owner.id,
            });
            await opts.organizations.addMembership({
              authOrgId: org.id,
              authMemberId: member.id,
              studentId: owner.id,
              role: member.role,
            });
          },
          afterAddMember: async ({ member, user, organization: org }) => {
            const student = await requireStudent(user.id);
            await opts.organizations.addMembership({
              authOrgId: org.id,
              authMemberId: member.id,
              studentId: student.id,
              role: member.role,
            });
          },
          afterRemoveMember: async ({ member }) => {
            await opts.organizations.removeMembership(member.id);
          },
          afterCreateInvitation: async ({ invitation, inviter, organization: org }) => {
            const inviterStudent = await requireStudent(inviter.id);
            await opts.organizations.recordInvitation({
              authOrgId: org.id,
              authInvitationId: invitation.id,
              email: invitation.email,
              role: invitation.role,
              status: invitation.status,
              inviterStudentId: inviterStudent.id,
              expiresAt: invitation.expiresAt ?? null,
            });
          },
          afterAcceptInvitation: async ({ invitation }) => {
            await opts.organizations.acceptInvitation({ authInvitationId: invitation.id });
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Translate better-auth's user into the identity context's input.
            await opts.identity.registerStudent({
              authUserId: user.id,
              email: user.email,
              displayName: user.name,
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
