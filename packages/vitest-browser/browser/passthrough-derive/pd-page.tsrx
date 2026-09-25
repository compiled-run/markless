import { state } from '@markless/core';
import Relay from './pd-relay.tsrx';

export default function Page() @{
	let seed = state(1);
	<main>
		<button type="button" data-bump onClick={() => seed++}>bump</button>
		<Relay seed={seed} />
	</main>
}
