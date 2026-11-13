import type { Children } from '@markless/core';

export function ChromeShell({ children, heading }: { readonly children?: Children; readonly heading: string }) @{
	<article>
		<header>{heading}</header>
		<section class="body">{children}</section>
	</article>
}
