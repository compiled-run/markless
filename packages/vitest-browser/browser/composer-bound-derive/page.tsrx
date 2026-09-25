import { state } from '@markless/core';
import Ladder from './ladder.tsrx';

export default function Page() @{
	let seed = state(0);
	<main>
		<button type="button" data-bump onClick={() => seed++}>bump</button>
		<Ladder seed={seed} />
	</main>
}
