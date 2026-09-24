import type { APIHandler } from "filesystem-routing/api";
import { SETTINGS_DELAY_MS, settingsServerResponse } from "../../shared/data";

export const POST: APIHandler = async ({ request }) => {
  const started = Date.now();
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}
  const result = settingsServerResponse(body);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, SETTINGS_DELAY_MS - (Date.now() - started))));
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

const methodNotAllowed: APIHandler = () => new Response(null, { status: 405, headers: { allow: "POST" } });
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
