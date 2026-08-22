import { state } from '@markless/core';
import { checklist } from '../../index.ts';

// The realistic one: a checklist inside a real form, one `name` per item, and the
// assertions read what the browser itself put in the FormData rather than an
// attribute. A ticked item submits its own value; an unticked one submits nothing.
export default function CondimentsForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checklist.root values={['lettuce', 'tomato']} data-testid="root">
			<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="selectall-trigger">
				<checklist.selectallindicator data-testid="selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="lettuce" name="lettuce" data-testid="lettuce">
				<checklist.field data-testid="lettuce-field" />
				<checklist.itemtrigger data-testid="lettuce-trigger">
					<checklist.itemindicator data-testid="lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="tomato" name="tomato" data-testid="tomato">
				<checklist.field data-testid="tomato-field" />
				<checklist.itemtrigger data-testid="tomato-trigger">
					<checklist.itemindicator data-testid="tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
