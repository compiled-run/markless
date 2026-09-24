import { HydrationScript } from "@solidjs/web";
import type { ParentProps } from "solid-js";

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="benchmark:entrant" content="solidstart" />
        <meta name="benchmark:build" content={__BENCHMARK_BUILD_ID__} />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
