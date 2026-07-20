import { state } from '@markless/core';

export default function Child({ initial }) @{
	let count = state(initial);

	<button type="button" data-f8-count onClick={() => count++}>{count}</button>
}
