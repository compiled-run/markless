import { state } from '@markless/core';

function SignalButton({ label, onTrace }) @{
	<button type="button" data-signal={label} onClick={() => {
		onTrace({ count: 1, source: label });
	}}>{label}</button>
}

export default function CaptureSlotSiblings() @{
	let graphLabel = state('Graph cedar');
	let graphResult = state('none');
	let literalSource = state('none');
	let count = state(99);

	<section data-capture-slot-siblings>
		<SignalButton
			label={graphLabel}
			onTrace={({ count, source }) => graphResult = source + ':' + count}
		/>
		<SignalButton
			label="Literal coral"
			onTrace={({ count: nextCount, source }) => { count = nextCount; literalSource = source; }}
		/>
		<output data-graph-result>{graphResult}</output>
		<output data-collision-result>{literalSource + ':' + count}</output>
	</section>
}
