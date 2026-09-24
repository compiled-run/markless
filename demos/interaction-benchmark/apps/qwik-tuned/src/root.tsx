import { component$ } from "@qwik.dev/core";
import { DocumentHeadTags, RouterOutlet, useQwikRouter } from "@qwik.dev/router";

import "./shared/styles.css";

export default component$(() => {
  useQwikRouter();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="benchmark:entrant" content="qwik" />
        <meta name="benchmark:build" content={__BENCHMARK_BUILD_ID__} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <DocumentHeadTags />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});
