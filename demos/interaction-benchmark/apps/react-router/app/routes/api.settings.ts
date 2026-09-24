import { SETTINGS_DELAY_MS, settingsServerResponse } from "../shared/data";
import type { Route } from "./+types/api.settings";

const methodNotAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } });

export function loader() {
  return methodNotAllowed();
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return methodNotAllowed();
  const delay = new Promise((resolve) => setTimeout(resolve, SETTINGS_DELAY_MS));
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = {};
  }
  const result = settingsServerResponse(body);
  await delay;
  return Response.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
