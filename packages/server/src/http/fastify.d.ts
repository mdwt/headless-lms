import 'fastify';

// Minimal shape of the authenticated user attached to a request by
// `requireSession`. Defined locally so `http` need not import the auth adapter
// (the boundary linter allows http -> app/core only).
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
    /** Active organization id from the session, set by `requireSession`. */
    orgId?: string | null;
  }
}
