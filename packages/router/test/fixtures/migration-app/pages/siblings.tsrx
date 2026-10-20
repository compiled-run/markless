import { computed } from '@markless/core';
import LedgerLine from '../src/ledger-line.tsrx';

export default function SiblingsPage() @{
	const ledger = computed(async () => ({ owner: 'Ada', first: '$12', second: '$30' }));
	<main>
		@try {
			<>
				<h2 data-owner>{ledger.owner}</h2>
				<LedgerLine amount={ledger.first} />
				<LedgerLine amount={ledger.second} />
				<p data-closing>end of ledger</p>
			</>;
		} @pending {
			<p>loading ledger</p>;
		}
	</main>;
}
