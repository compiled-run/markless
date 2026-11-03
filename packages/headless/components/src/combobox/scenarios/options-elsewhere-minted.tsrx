import { state } from '@markless/core';
import { combobox } from '../../index.ts';
import OptionList from './options-elsewhere-minted-list.tsrx';

export function OptionsElsewhereMinted() @{
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
