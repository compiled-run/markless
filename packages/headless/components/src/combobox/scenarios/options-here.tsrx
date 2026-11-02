import { computed, state } from '@markless/core';
import { combobox } from '../../index.ts';

function OptionList({ onPick }: { readonly onPick: (fruit: string) => void }) @{
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

export function OptionsHere() @{
	let picked = state('');

	<div>
		<combobox.root inline data-testid="root">
			<combobox.label data-testid="label">Favorite Fruit</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.content data-testid="content">
				<OptionList
					onPick={(fruit: string) => {
						picked = fruit;
					}}
				/>
			</combobox.content>
		</combobox.root>
		<output data-testid="picked">{picked}</output>
	</div>
}
