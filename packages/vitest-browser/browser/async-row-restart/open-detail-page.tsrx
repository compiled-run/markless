import { state } from '@markless/core';
import OpenDetailList from './open-detail-list.tsrx';

export default function OpenDetailPage() @{
	let reload = state(0);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<OpenDetailList reload={reload} />
	</main>
}
