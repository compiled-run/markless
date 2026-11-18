import { shared, state } from '@markless/core';

export const theme = shared(() => {
	const value = state({ name: 'paper' });
	return value;
});

export const desk = shared(
	() => {
		const value = state({ name: 'oak' });
		return value;
	},
	{ scope: 'container' },
);

export default function Flip() @{
	const look = theme();
	const table = desk();

	<p>
		<button type="button" data-flip onClick={() => (look.name = look.name === 'paper' ? 'ink' : 'paper')}>Flip</button>
		<button type="button" data-swap onClick={() => (table.name = table.name === 'oak' ? 'pine' : 'oak')}>Swap</button>
	</p>
}
