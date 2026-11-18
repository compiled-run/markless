import { state } from '@markless/core';
import { Lamp } from './lamp.tsrx';
import { follow } from './follow.ts';

export default function AttachStateInputPage() @{
	let lit = state(false);
	<section>
		<button data-flip onClick={() => (lit = !lit)}>
			Flip
		</button>
		<p data-own attach={follow(lit)} onClick={() => {}}>
			Own
		</p>
		<Lamp lit={lit}>Lamp</Lamp>
	</section>
}
