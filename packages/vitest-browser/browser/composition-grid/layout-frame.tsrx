import type { Children } from '@markless/core';

export default function LayoutFrame({ children }: { readonly children?: Children }) @{
	<div class="frame">
		<nav>Menu</nav>
		<main>{children}</main>
	</div>
}
