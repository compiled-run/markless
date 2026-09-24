import type { RequestHandler } from "@qwik.dev/router";
import { SETTINGS_DELAY_MS, settingsServerResponse } from "~/shared/data";

export const onRequest: RequestHandler = async ({ method, request, send }) => {
  if (method !== "POST") {
    send(new Response(null, { status: 405, headers: { allow: "POST" } }));
    return;
  }
  const started = Date.now();
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = {};
  }
  const result = settingsServerResponse(body);
  const remaining = SETTINGS_DELAY_MS - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  send(
    new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }),
  );
};
