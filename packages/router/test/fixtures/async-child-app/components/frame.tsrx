import type { Children } from '@markless/core';

export default function Frame({ children }: { readonly children?: Children }) @{
	<div class="frame">
		<header>Account</header>
		{children}
	</div>
}
