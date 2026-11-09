import { state } from '@markless/core';
import { Card } from './card.tsrx';

export function LivePage() @{
	let count = state(0);
	<main>
		<Card>
			<button type="button" data-projected onClick={() => (count = count + 1)}>Count {count}</button>
		</Card>
	</main>
}
