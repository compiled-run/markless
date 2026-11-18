import { state } from '@markless/core';
import DetailList from './detail-list.tsrx';

export default function DetailPage() @{
	let reload = state(0);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<DetailList reload={reload} />
	</main>
}
