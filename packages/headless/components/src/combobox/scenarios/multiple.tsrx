import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// More than one choice at a time, with backspace giving the last one back. The
// consumer owns the chips, because they already own the data the chips are made
// of - which is why the family exposes no `displayValue`.
export function Multiple() @{
	let picked = state('');

	<div>
		<combobox.root
			open
			multiple
			removeOnBackspace
			data-testid="root"
			onChange={(next: string | readonly string[]) => {
				picked = typeof next === 'string' ? next : next.join(',');
			}}
		>
			<combobox.label data-testid="label">Toppings</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.content data-testid="content">
				<combobox.item value="olive" label="Olive" data-testid="olive">
					<combobox.itemlabel data-testid="olive-itemlabel">Olive</combobox.itemlabel>
					<combobox.itemindicator data-testid="olive-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
				<combobox.item value="basil" label="Basil" data-testid="basil">
					<combobox.itemlabel data-testid="basil-itemlabel">Basil</combobox.itemlabel>
					<combobox.itemindicator data-testid="basil-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
				<combobox.item value="caper" label="Caper" data-testid="caper">
					<combobox.itemlabel data-testid="caper-itemlabel">Caper</combobox.itemlabel>
					<combobox.itemindicator data-testid="caper-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<output data-testid="picked">{picked}</output>
	</div>
}
