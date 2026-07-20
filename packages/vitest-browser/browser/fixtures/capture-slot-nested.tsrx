import { state } from '@markless/core';

function NestedTrigger({ label, onForward }) @{
	<button type="button" data-nested-trigger={label} onClick={() => onForward(label)}>{label}</button>
}

function DirectRelay({ label, onForward }) @{
	<div data-direct-relay={label}>
		<NestedTrigger label={label} onForward={onForward} />
	</div>
}

export default function CaptureSlotNested() @{
	let firstCalls = state(0);
	let secondCalls = state(0);
	let firstValue = state('none');
	let secondValue = state('none');

	<section data-capture-slot-nested>
		<DirectRelay
			label="Nested elm"
			onForward={(value) => { firstCalls++; firstValue = firstCalls + ':' + value; }}
		/>
		<DirectRelay
			label="Nested quartz"
			onForward={(value) => { secondCalls++; secondValue = secondCalls + ':' + value; }}
		/>
		<output data-first-forward>{firstValue}</output>
		<output data-second-forward>{secondValue}</output>
	</section>
}
