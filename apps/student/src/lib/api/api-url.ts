/** Where this app's server reaches the API. The browser never uses it: it calls `/api` on its own domain. */
export const API_URL = process.env.API_URL ?? "http://localhost:8000";
