import type { Children } from '@markless/core';

export default function Stage({ children }: { readonly children?: Children }) @{
	<figure>
		<div data-stage attach={(stage) => void stage.toggleAttribute('data-attached', true)}>{children}</div>
	</figure>
}
