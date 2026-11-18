import { state } from '@markless/core';
import { addItem, rename } from './mutators.ts';

export default function RenamePage() @{
	let user = state({ first: 'Ada' });
	let list = state(['a']);
	<div>
		<output data-o>{user.first}</output>
		<output data-n>{list.length}</output>
		<button data-rename onClick={() => rename(user, 'Cy')}>a</button>
		<button data-add onClick={() => addItem(list, 'z')}>b</button>
	</div>
}
