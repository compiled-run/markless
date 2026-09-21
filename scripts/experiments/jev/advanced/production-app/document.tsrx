import type { Children } from '@markless/core';
import { Html } from '@markless/core/router';
export default function Document({ children }: { readonly children?: Children }) @{
  <Html><head><title>Interrupted SSR navigation</title><link rel="icon" href="data:," /></head><body>{children}</body></Html>
}
