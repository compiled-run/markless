import { shared, state } from '@markless/core';

export const choice = shared(() => {
	const c = state({ value: 'cli' });
	return c;
});

export function ChoicePanel() @{
	const c = choice();
	<section>
		<p data-shown>{c.value}</p>
		<p data-mode={c.value === 'cli' ? 'default' : 'chosen'}>{'mode'}</p>
		<button type="button" data-manual onClick={() => (c.value = 'manual')}>manual</button>
		<button type="button" data-auto onClick={() => (c.value = 'auto')}>auto</button>
	</section>
}
