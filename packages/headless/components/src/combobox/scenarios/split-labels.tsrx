import { computed } from '@markless/core';
import { combobox } from '../../index.ts';

// Each option draws its label from a nested repeat, and the page starts with no
// options at all: every row is rendered in the browser after the first keystroke.
function Matches() @{
	const c = combobox.state();
	const matches = computed(() =>
		c.input === ''
			? []
			: ['Apple', 'Banana', 'Cherry']
					.filter((fruit) => fruit.toLowerCase().includes(c.input.toLowerCase()))
					.map((fruit) => ({ fruit, letters: fruit.split('').map((letter, at) => ({ letter, at: String(at) })) })),
	);

	<div role="presentation" data-testid="rows">
		@for (const match of matches; key match.fruit) {
			<combobox.item value={match.fruit}>
				<combobox.itemlabel>
					@for (const part of match.letters; key part.at) {
						<span>{part.letter}</span>
					}
				</combobox.itemlabel>
			</combobox.item>
		}
	</div>
}

export function SplitLabels() @{
	<combobox.root inline data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.content data-testid="content">
			<Matches />
		</combobox.content>
	</combobox.root>
}
