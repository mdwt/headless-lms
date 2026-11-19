import { forwardToApi } from "@/lib/api/forward";
import { API_URL } from "@/lib/api/api-url";

export const dynamic = "force-dynamic";

const forward = (request: Request) => forwardToApi(request, API_URL);

export {
  forward as GET,
  forward as HEAD,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as OPTIONS,
};
