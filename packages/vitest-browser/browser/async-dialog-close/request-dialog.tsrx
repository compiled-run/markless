import { state } from '@markless/core';
import type { Unit } from './units.ts';

export default function RequestDialog({
	units,
	submitting,
	onSave,
}: {
	units: Unit[];
	submitting: boolean;
	onSave: (unitId: string) => Promise<void>;
}) @{
	let unitId = state('');

	<form
		data-dialog
		onSubmit={async (event) => {
			event.preventDefault();
			await onSave(unitId);
		}}
	>
		<select value={unitId} onChange={(event) => (unitId = event.currentTarget.value)}>
			<option value="">Choose a unit</option>
			@for (const unit of units; key unit.id) {
				<option value={unit.id}>{unit.id}</option>
			}
		</select>
		<button type="submit">{submitting ? 'Submitting' : 'Submit'}</button>
	</form>
}
