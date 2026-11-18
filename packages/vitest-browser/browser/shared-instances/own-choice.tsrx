import { shared, state } from '@markless/core';

export const ownChoice = shared(
	() => {
		const c = state({ value: 'cli' });
		return c;
	},
	{ scope: 'container' },
);

export function OwnChoicePanel() @{
	const c = ownChoice();
	<section>
		<p data-shown>{c.value}</p>
		<button type="button" data-manual onClick={() => (c.value = 'manual')}>manual</button>
	</section>
}
