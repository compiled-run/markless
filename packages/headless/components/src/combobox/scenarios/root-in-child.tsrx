import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// The whole widget, and the state its onChange writes, live in a component the page renders.
function Picker() @{
	let chosen = state('');

	<div>
		<combobox.root
			inline
			data-testid="root"
			onChange={(next: string | readonly string[]) => {
				chosen = typeof next === 'string' ? next : next.join(',');
			}}
		>
			<combobox.label data-testid="label">Favorite Fruit</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.content data-testid="content">
				<combobox.item value="apple" label="Apple" data-testid="apple">
					<combobox.itemlabel>Apple</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="banana" label="Banana" data-testid="banana">
					<combobox.itemlabel>Banana</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<output data-testid="chosen">{chosen}</output>
	</div>
}

export function RootInChild() @{
	<main>
		<Picker />
	</main>
}
