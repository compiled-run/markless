import { state } from '@markless/core';
import { saveReport } from './ledger.ts';

export function Saver({ days }) @{
	let note = state('idle');

	<div>
		<button
			type="button"
			data-save
			onClick={async () => {
				note = 'saving';
				await saveReport(days);
			}}
		>
			Save
		</button>
		<p data-note>{note}</p>
	</div>
}
