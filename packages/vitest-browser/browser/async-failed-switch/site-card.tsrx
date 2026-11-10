import { computed, state } from '@markless/core';
import Invoices from './site/invoices.tsrx';

export default function SiteCard() @{
	let tab = state('preview');
	let reload = state(0);
	let run = state(0);
	const runs = computed(() => [{ run, reload }]);

	<div data-slot="tabs">
		<div data-slot="card">
			<div role="toolbar">
				<button data-reload onClick={() => reload++}>reload</button>
				<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
				<button data-tab onClick={() => (tab = tab === 'preview' ? 'code' : 'preview')}>{tab}</button>
			</div>
			<div role="tabpanel" hidden={tab !== 'preview'}>
				<div data-slot="preview">@for (const item of runs; key item.run) {<Invoices reload={item.reload} />}</div>
			</div>
		</div>
	</div>
}
