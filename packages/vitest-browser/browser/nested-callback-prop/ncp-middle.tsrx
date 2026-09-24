import { state } from '@markless/core';
import { Picker } from './ncp-picker.tsrx';
import { Tap } from './ncp-tap.tsrx';

export function Middle() @{
	let count = state(0);
	let taps = state(0);
	<div>
		<Picker label="middle" onPick={(_mark) => (count = count + 1)} />
		<output data-middle-count>{count}</output>
		<Tap label="middle-direct" onTap={() => (taps = taps + 1)} />
		<output data-middle-taps>{taps}</output>
	</div>
}
