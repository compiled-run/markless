import { state } from '@markless/core';
import { combobox } from '../../index.ts';
import MintedOptionList from './options-elsewhere-minted-list.tsrx';

function Box() @{
	let picked = state('');

	<div>
		<combobox.input data-testid="input" />
		<combobox.content data-testid="content">
			<MintedOptionList
				onPick={(fruit: string) => {
					picked = fruit;
				}}
			/>
		</combobox.content>
		<output data-testid="picked">{picked}</output>
	</div>
}

export default function DeepSearch() @{
	<combobox.root inline data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<Box />
	</combobox.root>
}
