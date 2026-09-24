import { state } from '@markless/core';
import Shell from './shell.tsrx';

export default function Page() @{
	let count = state(0);

	<Shell>
		<button type="button" onClick={() => (count += 1)}>{count}</button>
	</Shell>
}
