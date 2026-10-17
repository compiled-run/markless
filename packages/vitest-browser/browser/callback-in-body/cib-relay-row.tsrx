import { state } from '@markless/core';
import { Row } from './cib-row.tsrx';

export function RelayRow({ label, onPicked }: { readonly label: string; readonly onPicked: () => void }) @{
	let presses = state(0);
	<div>
		<Row label={label} onActions={() => {
			presses = presses + 1;
			onPicked();
		}} />
		<output data-presses={label}>{presses}</output>
	</div>
}
