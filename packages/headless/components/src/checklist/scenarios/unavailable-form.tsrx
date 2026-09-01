import { state } from '@markless/core';
import { checklist } from '../../index.ts';

// A ticked item nobody may untick, inside a real form. A disabled control is left
// out of the form data set, so only the item a person owns reaches the server.
export default function UnavailableForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checklist.root value={['lettuce', 'caviar']} values={['lettuce', 'caviar']} data-testid="root">
			<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
			<checklist.item value="lettuce" name="lettuce" data-testid="lettuce">
				<checklist.field data-testid="lettuce-field" />
				<checklist.itemtrigger data-testid="lettuce-trigger">
					<checklist.itemindicator data-testid="lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="caviar" name="caviar" disabled data-testid="caviar">
				<checklist.field data-testid="caviar-field" />
				<checklist.itemtrigger data-testid="caviar-trigger">
					<checklist.itemindicator data-testid="caviar-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="caviar-label">Not available on your plan</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
