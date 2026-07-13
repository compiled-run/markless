import { state } from '@markless/core';
export function NestedMarkup() @{
	let title = state('Dashboard');
	<main><header><h1>{title}</h1><nav><a href="/one">One</a><a href="/two">Two</a></nav></header><section><article><h2>Summary</h2><p>Stable nested content.</p></article></section></main>
}
