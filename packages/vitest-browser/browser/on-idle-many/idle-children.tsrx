import { state } from '@markless/core';
import { count } from './idle-count.ts';

export function Grid() @{
	let ready = state(false);
	<section data-ready={ready} onIdle={() => ((ready = true), count('grid'))}>
		grid
	</section>;
}

export function Details() @{
	<aside onIdle={() => count('details')}>details</aside>;
}
