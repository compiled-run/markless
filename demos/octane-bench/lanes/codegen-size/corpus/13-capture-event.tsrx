import { state } from '@markless/core';
export function CaptureEvent() @{
	let phase = state('waiting');
	<div onClickCapture={() => phase = 'captured'}><button onClick={() => phase = 'clicked'}>Dispatch</button><output>{phase}</output></div>
}
