import { state } from '@arcadejs/core';

export function Card() @{
	let title = state("Library card");

	<article>{title}</article>
}
