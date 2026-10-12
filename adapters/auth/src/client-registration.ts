export function withLoopbackNativeDefault(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const registration = body as Record<string, unknown>;
  const redirectUris = registration.redirect_uris;
  if (registration.application_type !== undefined || !Array.isArray(redirectUris)) {
    return null;
  }
  const httpsOnly = redirectUris.every(
    (uri) => typeof uri === "string" && uri.toLowerCase().startsWith("https:"),
  );
  return httpsOnly ? null : { ...registration, application_type: "native" };
}
