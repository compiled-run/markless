import { state } from '@markless/core';

export default function ProjectedStateTrigger() @{
	let hits = state(0);
	<button type="button" data-projected-trigger onClick={() => { hits++; }}>{hits}</button>
}
