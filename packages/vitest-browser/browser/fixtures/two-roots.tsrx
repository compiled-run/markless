import { state } from '@markless/core';

export default function TwoRoots() @{
	let count = state(0);

	<header data-top>top</header>;
	<button type="button" data-count onClick={() => count++}>{count}</button>
}
