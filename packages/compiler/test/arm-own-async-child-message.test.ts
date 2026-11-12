import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

const source = `
import { computed, state } from '@markless/core';

export default function Accounts() @{
	let picked = state<number | null>(null);
	<div>
		<button onClick={() => (picked = 7)}>open</button>
		@if (picked !== null) {
			<Ledger account={picked} />
		}
	</div>
}

function Ledger({ account }: { account: number }) @{
	const entries = computed(async () => ({ total: account * 10 }));
	@try { <p>{entries.total}</p> } @pending { <p>loading</p> }
}
`;

test('the arm refusal suggests only restructures that build, never moving the @if into the child', async () => {
	const result = await compileTsrxModule({ filename: 'src/accounts.tsrx', source, symbols: [] });
	const refusal = collectTsrxModuleDiagnostics(result).find(
		(diagnostic) => diagnostic.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	const suggestion = refusal?.suggestions?.[0]?.message ?? '';
	expect(suggestion).toContain('hidden={!(picked !== null)}');
	expect(suggestion).toContain('declare what it keeps in the component that owns the @if');
	expect(suggestion).toContain('Moving the @if into the component does not help');
	expect(JSON.stringify(collectTsrxModuleDiagnostics(result))).not.toContain('marklessProps');
});
