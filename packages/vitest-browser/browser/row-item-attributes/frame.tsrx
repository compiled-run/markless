import type { Children } from '@markless/core';

export default function Frame({ children }: { readonly children?: Children }) @{
	<figure>
		<div class="stage">{children}</div>
	</figure>;
}
