import { state } from '@markless/core';
import { rename } from './mutators.ts';

export default function StartedPage() @{
	let user = state({ first: 'Ada' });
	let n = state(0);
	<div>
		<output data-o>{user.first}</output>
		<button data-n onClick={() => n++}>{n}</button>
		<button data-rename onClick={() => rename(user, 'Cy')}>a</button>
		<button data-rename2 onClick={() => rename(user, 'Di')}>b</button>
	</div>
}
