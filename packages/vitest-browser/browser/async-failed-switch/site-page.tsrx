import { computed, state } from '@markless/core';
import Invoices from './site/invoices.tsrx';

export default function SitePage() @{
	let reload = state(0);
	let run = state(0);
	const runs = computed(() => [{ run, reload }]);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
		<div>
			@for (const item of runs; key item.run) {
				<Invoices reload={item.reload} />
			}
		</div>
	</main>
}
