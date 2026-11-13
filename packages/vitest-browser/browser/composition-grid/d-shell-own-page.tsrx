import { state } from '@markless/core';
import { ChromeShell } from './chrome-shell.tsrx';
import { LedgerPanel } from './ledger-panel.tsrx';

export default function ShellOwnPage() @{
	let topic = state('a');
	let version = state(0);

	<section>
		<ChromeShell heading="Ledger">
			<LedgerPanel topic={topic} version={version} />
		</ChromeShell>
		<button type="button" data-grid-subject onClick={() => (topic = topic === 'a' ? 'b' : 'a')}>Switch</button>
		<button type="button" data-grid-reload onClick={() => version++}>Again</button>
	</section>
}
