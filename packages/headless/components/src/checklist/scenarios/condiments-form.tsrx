import { state } from '@markless/core';
import { checkbox, checklist } from '../../index.ts';

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
			<checklist.selectall data-testid="selectall">
				<checkbox.trigger data-testid="selectall-trigger">
					<checkbox.indicator data-testid="selectall-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="selectall-label">All condiments</checkbox.label>
			</checklist.selectall>
			<checklist.item value="lettuce" name="lettuce" data-testid="lettuce">
				<checkbox.field data-testid="lettuce-field" />
				<checkbox.trigger data-testid="lettuce-trigger">
					<checkbox.indicator data-testid="lettuce-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="lettuce-label">Lettuce</checkbox.label>
			</checklist.item>
			<checklist.item value="tomato" name="tomato" data-testid="tomato">
				<checkbox.field data-testid="tomato-field" />
				<checkbox.trigger data-testid="tomato-trigger">
					<checkbox.indicator data-testid="tomato-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="tomato-label">Tomato</checkbox.label>
			</checklist.item>
		</checklist.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
