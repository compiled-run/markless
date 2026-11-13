import type { Children } from '@markless/core';

export default function Shell({ children }: { readonly children?: Children }) @{
	<div class="shell">
		<nav>Menu</nav>
		{children}
	</div>
}
