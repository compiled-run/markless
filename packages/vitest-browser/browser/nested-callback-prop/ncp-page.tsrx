import { state } from '@markless/core';
import { Middle } from './ncp-middle.tsrx';
import { Panel, Picker } from './ncp-picker.tsrx';
import { Relay } from './ncp-relay.tsrx';

function LocalMiddle() @{
	let taps = state(0);
	<div>
		<Picker label="local" onPick={() => (taps = taps + 1)} />
		<output data-local-count>{taps}</output>
	</div>
}

export default function Page() @{
	let picked = state('');
	let direct = state(0);
	let forwarded = state('');
	let taps = state(0);
	<section>
		<Picker label="direct" onPick={() => (direct = direct + 1)} />
		<output data-direct-count>{direct}</output>
		<Middle />
		<LocalMiddle />
		<Panel>
			<Picker label="projected" onPick={(mark) => (picked = 'projected' + mark)} />
		</Panel>
		<output data-picked>{picked}</output>
		<Relay onPick={(mark) => (forwarded = forwarded + 'forwarded' + mark)} onTap={() => (taps = taps + 1)} />
		<output data-forwarded>{forwarded}</output>
		<output data-forwarded-direct>{taps}</output>
	</section>
}
