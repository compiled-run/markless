/**
 * SSR renderer function, used by Qwik Router.
 *
 * Tuned variant: the two render options below are the only differences from the default entrant's
 * entry.ssr.tsx. See BENCH.md "Tuning" for the Qwik documentation behind each.
 */
import { createRenderer } from "@qwik.dev/router";
import Root from "./root";

export default createRenderer((opts) => {
  return {
    jsx: <Root />,
    options: {
      ...opts,
      qwikLoader: "inline",
      preloader: { ssrPreloads: 8, maxIdlePreloads: 25 },
      containerAttributes: {
        lang: "en",
        ...opts.containerAttributes,
      },
      serverData: {
        ...opts.serverData,
      },
    },
  };
});
