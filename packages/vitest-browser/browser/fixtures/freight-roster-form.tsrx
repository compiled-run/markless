import { computed, state } from '@markless/core';

export default function FreightRosterForm() @{
	let lane = state('north');
	let submitted = state('none');
	const roster = computed(async () => {
		const selected = lane;
		return { name: selected === 'south' ? 'South freight roster' : 'North freight roster' };
	});

	<>
		<select data-lane-select onChange={() => lane = 'south'}>
			<option value="north">North</option>
			<option value="south">South</option>
		</select>
		<output data-submit-result>{submitted}</output>
		@try {
			<form data-roster-form>
				<strong data-roster-name>{roster.name}</strong>
				<button type="button" data-pr-submit onClick={() => submitted = 'submitted:' + roster.name}>Submit roster</button>
			</form>
		} @pending {
			<p data-roster-pending>Loading roster</p>
		} @catch { <p data-roster-error>Roster unavailable</p> }
	</>
}
