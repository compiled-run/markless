import { state } from '@markless/core';
import { GuardedList } from './guarded-list.tsrx';

export default function GuardedForwarded() @{
	let saves = state(0);
	let last = state('');

	<main>
		<GuardedList labels={['left', 'right']} onSave={(it) => { saves = saves + 1; last = it; }} />
		<p data-saves>{`${saves} ${last}`}</p>
	</main>
}
