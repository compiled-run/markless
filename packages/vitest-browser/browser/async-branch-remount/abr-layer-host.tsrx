import type { Children } from '@markless/core';
import TintedSearch from './abr-tinted-search.tsrx';

function Layer({ fill, children }: { readonly fill: string; readonly children?: Children }) @{
	<div data-layer data-fill={fill}>{children}</div>
}

export default function LayeredPage() @{
	<main>
		<Layer fill="dim">
			<TintedSearch tint="blue" />
		</Layer>
	</main>
}
