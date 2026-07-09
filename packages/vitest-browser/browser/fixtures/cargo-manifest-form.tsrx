import { state } from '@markless/core';

export function CargoManifestForm({ lanes }) @{
	let status = state('idle');

	<form data-cargo-form>
		<select data-lane>
			@for (const lane of lanes; key lane.code) {
				<option value={lane.code}>{lane.name}</option>
			}
		</select>
		<div data-seal>Seal ready</div>
		<button type="button" data-send onClick={() => status = 'submitted'}>Send manifest</button>
		<output data-status>{status}</output>
	</form>
}
