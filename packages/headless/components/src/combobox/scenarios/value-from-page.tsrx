import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// The page owns the choice and moves it with a button of its own.
export function ValueFromPage() @{
	let fruit = state('apple');

	<div>
		<button type="button" data-testid="pick-banana" onClick={() => { fruit = 'banana'; }}>Banana</button>
		<combobox.root
			value={fruit}
			onChange={(next: string | readonly string[]) => {
				fruit = typeof next === 'string' ? next : next.join(',');
			}}
			data-testid="root"
		>
			<combobox.label data-testid="label">Favorite Fruit</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.content data-testid="content">
				<combobox.item value="apple" label="Apple" data-testid="apple">
					<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="banana" label="Banana" data-testid="banana">
					<combobox.itemlabel data-testid="banana-itemlabel">Banana</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
	</div>
}
