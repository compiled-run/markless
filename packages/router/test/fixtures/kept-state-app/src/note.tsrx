import { state } from '@markless/core';

export default function Note() @{
	let taps = state(0);

	<button type="button" data-note onClick={() => taps++}>{`note ${taps}`}</button>
}
