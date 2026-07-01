import { state } from '@markless/core';

export function Card() @{
	let title = state("Library card");

	<article>{title}</article>
}
