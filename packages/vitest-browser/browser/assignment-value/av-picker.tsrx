import { state } from '@markless/core';
import { record } from './record.ts';

export function Picker({ onPick }: { readonly onPick: () => number | Promise<number> }) @{
	let got = state('');
	<div>
		<button data-pick type="button" onClick={async () => (got = record('pick', await onPick()))}>pick</button>
		<output data-got>{got}</output>
	</div>
}
