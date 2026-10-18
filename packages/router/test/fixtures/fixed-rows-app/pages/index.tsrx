import { state } from '@markless/core';
import List from './list.tsrx';

export default function Index() @{
	let clicks = state(0);
	let names = state(['0', '1']);
	<main data-page="index">
		<button
			data-more
			onClick={() => {
				clicks++;
				names = [...names, String(names.length)];
			}}
		>
			more
		</button>
		<List title={`clicked ${clicks}`} names={names} />
	</main>;
}
