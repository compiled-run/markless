import { computed } from '@markless/core';
import { combobox } from '../../index.ts';

// The consumer's option list, in a module of its own, rendered inside another module's root.
export default function OptionList({ onPick }: { readonly onPick: (fruit: string) => void }) @{
	const c = combobox.state();
	const matches = computed(() =>
		['Apple', 'Banana', 'Cherry'].filter((fruit) => fruit.toLowerCase().includes(c.input.toLowerCase())),
	);

	<div role="presentation" data-testid="rows">
		@for (const fruit of matches; key fruit) {
			<combobox.item value={fruit} data-testid="row" onClick={() => onPick(fruit)}>
				<combobox.itemlabel>{fruit}</combobox.itemlabel>
			</combobox.item>
		}
	</div>
}
