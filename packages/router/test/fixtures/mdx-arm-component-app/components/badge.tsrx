import { state } from '@markless/core';

export default function Badge() @{
	let hits = state(0);

	<button class="badge" onClick={() => hits++}>{hits}</button>
}
