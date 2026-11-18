import { shared, state } from '@markless/core';

export const choice = shared(() => {
	const c = state({ value: 'cli' });
	return c;
});

export function ChoiceButtons() @{
	const c = choice();
	<div>
		<button type="button" data-manual onClick={() => (c.value = 'manual')}>manual</button>
		<button type="button" data-auto onClick={() => (c.value = 'auto')}>auto</button>
	</div>
}
