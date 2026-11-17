import { state } from '@markless/core';
import { GuardedPanel } from './guarded-panel.tsrx';

export default function GuardedRow() @{
	let saves = state(0);
	let last = state('');

	<main>
		@for (const label of ['solo']; key label) {
			<GuardedPanel label={label} onSave={(it) => { saves = saves + 1; last = it; }} />
		}
		<p data-saves>{`${saves} ${last}`}</p>
	</main>
}
