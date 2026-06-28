# MCP Readiness Slice A — Task A2 Report

## Status: DONE

## Files Changed

### `apps/api/src/http/server.ts`
- Added import: `oAuthDiscoveryMetadata`, `oAuthProtectedResourceMetadata` from `better-auth/plugins` (not `better-auth/plugins/mcp` — that export does not exist in 1.6.22; functions are in the barrel `better-auth/plugins`).
- Added `bridgeWebResponse(response, reply)` helper to avoid duplicating the Web Response → Fastify reply bridging across three call sites. Existing auth catch-all now uses it too.
- `loadConfig()`: extracted `apiOrigin` from `BETTER_AUTH_URL`; `trustedOrigins` now deduplicates `clientOrigins ∪ {apiOrigin}` so the API's own origin is always trusted.
- Registered `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` at root (outside any `/api` prefix).

### `apps/api/src/http/discovery.test.ts` (new)
Vitest integration test using `app.inject()` (no port binding required). Two assertions:
1. `/.well-known/oauth-authorization-server` → 200, body has `issuer` or `authorization_endpoint`.
2. `/.well-known/oauth-protected-resource` → 200, body has `resource` or `authorization_servers`.

## Verify Command Outputs

```
pnpm vitest run apps/api/src/http/discovery.test.ts
  ✓ apps/api/src/http/discovery.test.ts (2 tests) 66ms
  Test Files  1 passed (1)  Tests  2 passed (2)

pnpm typecheck → all 6 workspace projects: Done (no errors)

pnpm build → ESM ⚡️ Build success in 33ms (all apps/packages)

pnpm lint → exit 0 (no output = no errors)
```

## Deviations

- Import path corrected from `better-auth/plugins/mcp` (as specified in the brief) to `better-auth/plugins`. The `./plugins/mcp` subpath export does not exist in `better-auth@1.6.22`; the functions are barrel-exported from `./plugins`.

## Concerns

None. All checks pass.
