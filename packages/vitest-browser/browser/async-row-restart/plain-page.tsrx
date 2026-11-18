import { state } from '@markless/core';
import PlainList from './plain-list.tsrx';

export default function PlainPage() @{
	let reload = state(0);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<PlainList reload={reload} />
	</main>
}
