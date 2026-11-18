import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// The fixes the arm refusal suggests must each build.
const fixes = {
	'hidden by an attribute': `
import { computed, state } from '@markless/core';

function Ledger({ account }: { account: number | null }) @{
	const entries = computed(async () => ({ total: account === null ? 0 : account * 10 }));
	<section>
		@try { <p>{entries.total}</p> } @pending { <p>loading</p> }
	</section>
}

export default function Accounts() @{
	let picked = state<number | null>(null);
	<div>
		<button onClick={() => (picked = 7)}>open</button>
		<div hidden={!(picked !== null)}><Ledger account={picked} /></div>
	</div>
}
`,
	'value declared beside the @if': `
import { computed, state } from '@markless/core';

export default function Accounts() @{
	let picked = state<number | null>(null);
	const entries = computed(async () => ({ total: picked === null ? 0 : picked * 10 }));
	<div>
		<button onClick={() => (picked = 7)}>open</button>
		@if (picked !== null) {
			@try { <p>{entries.total}</p> } @pending { <p>loading</p> }
		}
	</div>
}
`,
};

for (const [name, source] of Object.entries(fixes))
	for (const environment of ['client', 'server'] as const)
		test(`${name} builds for the ${environment}`, async () => {
			await expect(
				transformTsrxModule({ filename: '/workspace/app/src/Accounts.tsrx', source, environment }),
			).resolves.toBeDefined();
		});
