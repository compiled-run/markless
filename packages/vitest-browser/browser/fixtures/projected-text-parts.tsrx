import type { Children } from '@markless/core';

export function Chip(props: { readonly children?: Children }) @{
	<code data-chip>{props.children}<i>!</i></code>
}

export function Note({ children }: { readonly children?: Children }) @{
	<small data-note>note: {children}</small>
}

export function Shout({ children }: { readonly children?: Children }) @{
	<strong data-shout>
		@if (children) {
			<>{children}</>
		} @else {
			<>quiet</>
		}
	</strong>
}
