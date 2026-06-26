import { state } from 'arcade';

export function Card() @{
	let title = state("Library card");

	<article>{title}</article>
}
