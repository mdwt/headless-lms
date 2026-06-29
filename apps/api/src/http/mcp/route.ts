// MCP HTTP route — mounts a stateless StreamableHTTP MCP endpoint at /mcp.
//
// Each request is handled independently (stateless mode): no session affinity
// is required, which keeps the server horizontally scalable. better-auth's
// withMcpAuth validates the Bearer token on every request and provides the
// verified OAuthAccessToken; buildPrincipal translates it into a domain
// McpPrincipal that the tool callbacks close over.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { withMcpAuth } from "better-auth/plugins";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Container } from "../../composition/container.js";
import { buildPrincipal, PrincipalError } from "./principal.js";
import { registerTools } from "./tools.js";

/** Bridges a Web API Response back to a Fastify reply. */
async function bridgeMcpResponse(response: Response, reply: FastifyReply): Promise<void> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  const body = await response.text();
  reply.send(body || null);
}

export async function mcpRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { auth } = container;

  // The withMcpAuth wrapper verifies the bearer token and calls the inner
  // handler only when the token is valid. It returns (req: Request) => Promise<Response>.
  const mcpHandler = withMcpAuth(auth, async (req, token) => {
    let principal;
    try {
      principal = await buildPrincipal(token, container);
    } catch (err) {
      if (err instanceof PrincipalError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { "content-type": "application/json" },
        });
      }
      throw err;
    }

    // Stateless mode: a new McpServer + transport per request so every HTTP
    // call is self-contained. Tool callbacks close over the per-request principal.
    const mcpServer = new McpServer({ name: "headless-lms", version: "1.0.0" });
    registerTools(mcpServer, container, principal);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await mcpServer.connect(transport);
    return transport.handleRequest(req);
  });

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const webRequest = new Request(url.toString(), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body:
            request.method !== "GET" && request.method !== "DELETE"
              ? request.body
                ? typeof request.body === "string"
                  ? request.body
                  : JSON.stringify(request.body)
                : undefined
              : undefined,
        });

        const response = await mcpHandler(webRequest);
        await bridgeMcpResponse(response, reply);
      } catch (err) {
        console.error("[mcp] unexpected error:", err);
        await reply.status(500).send({ error: "internal_error" });
      }
    },
  });
}
