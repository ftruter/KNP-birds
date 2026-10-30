import { withCache } from "./cache.js";
import { parseUrl } from "./route.js";
import { methodNotAllowed, serverError } from "./respond.js";
import { renderRoute } from "./site.js";

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  let format = "html";
  try {
    const route = parseUrl(url);
    format = route.format || "html";
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(format);
    }
    return await withCache(request, ctx, () => renderRoute(request, env, route));
  } catch (error) {
    console.error(JSON.stringify({
      message: "request failed",
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
    return serverError(format);
  }
}
