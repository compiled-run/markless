import { computed, state } from '@markless/core';

export default function Form({ items, onSave }: { items: string[]; onSave: () => void }) @{
	let model = state({ pick: '' });
	let touched = state({ pick: false });
	const invalid = computed(() => !model.pick);

	<form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
		<select value={model.pick} onChange={(event) => (model.pick = event.currentTarget.value)}>
			<option value="">None</option>
			@for (const item of items; key item) {
				<option value={item}>{item}</option>
			}
		</select>
		<button type="button" data-touch onClick={() => (touched.pick = true)}>Touch</button>
		@if (touched.pick && !model.pick) {
			<span data-required>Required</span>
		}
		<button type="submit" disabled={invalid}>Save</button>
	</form>
}
