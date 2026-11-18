import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

export default function RouteDetail({ id, url }: { readonly id: string; readonly url: { readonly pathname: string } }) @{
	let round = state(1);
	const detail = computed(async () => {
		const at = round;
		return slow(`got ${id} at ${url.pathname} #${at}`, 300);
	});
	<section>
		@try {
			<p id="detail">{detail}</p>
		} @pending {
			<p id="detail-pending">loading {id}</p>
		} @catch (error) {
			<p id="detail-failed">{(error as Error).message}</p>
		}
		<button id="again" onClick={() => round++}>Again</button>
	</section>
}
