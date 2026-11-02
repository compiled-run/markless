import { computed } from '@markless/core';
import { combobox } from '../../index.ts';

// No row is served: every option is minted in the browser after the first keystroke.
export default function MintedOptionList({ onPick }: { readonly onPick: (fruit: string) => void }) @{
	const c = combobox.state();
	const matches = computed(() =>
		c.input === ''
			? []
			: ['Apple', 'Banana', 'Cherry'].filter((fruit) =>
					fruit.toLowerCase().includes(c.input.toLowerCase()),
				),
	);

	<div role="presentation" data-testid="rows">
		@for (const fruit of matches; key fruit) {
			<combobox.item value={fruit} data-testid="row" onClick={() => onPick(fruit)}>
				<combobox.itemlabel>{fruit}</combobox.itemlabel>
			</combobox.item>
		}
	</div>
}
