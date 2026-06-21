import { state } from '@arcade/core';

export function Card() @{
	let title = state("Library card");

	<article>{title}</article>
}
