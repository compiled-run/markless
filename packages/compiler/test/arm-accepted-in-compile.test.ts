import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { linkedRenderDataBoundarySymbols } from '../src/passes/link/interface-link.ts';
import { UNLINKED_RENDER } from './support/unlinked-render.ts';

// The compile decides whether an @if holding a component that has to run ships, from facts the build and the editor both have.

const OWN_STATE_CHILD = `
import { computed, state } from '@markless/core';

function Ledger({ account }: { account: number }) @{
	let opened = state(0);
	const entries = computed(async () => ({ total: account * 10 + opened }));
	@try { <p onClick={() => opened++}>{entries.total}</p> } @pending { <p>loading</p> }
}

export default function Accounts() @{
	let picked = state<number | null>(null);
	<div>
		<button onClick={() => (picked = 7)}>open</button>
		@if (picked !== null) {
			<Ledger account={picked} />
		}
	</div>
}
`;

const codes = (result: Awaited<ReturnType<typeof compileTsrxModule>>) =>
	collectTsrxModuleDiagnostics(result).map((diagnostic) => [diagnostic.code, diagnostic.severity]);

test('a same-file component that has to run ships from the compile alone, with the warning that the browser renders it', async () => {
	const result = await compileTsrxModule({ filename: 'src/accounts.tsrx', source: OWN_STATE_CHILD, symbols: [] });
	expect(codes(result)).not.toContainEqual(['MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED', 'error']);
	expect(codes(result)).toContainEqual(['MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER', 'warning']);
});

test('the escalation symbol the link emits is the arm the compile accepted', async () => {
	const result = await compileTsrxModule({ filename: 'src/accounts.tsrx', source: OWN_STATE_CHILD, symbols: [] });
	const symbols = linkedRenderDataBoundarySymbols({
		compiled: result,
		link: {},
		clientLink: true,
		renderDataId: 'virtual:render-data',
		resolverId: 'virtual:resolver',
		symbolModuleId: (symbolId: string) => `virtual:symbol:${symbolId}`,
		boundaryExportName: (index: number) => `boundaryUpdate${String(index)}`,
		branchExportName: (index: number) => `branchUpdate${String(index)}`,
	} as never);
	expect(symbols.filter((symbol) => symbol.manifest.kind === 'branch-update').map((symbol) => symbol.row.id)).toEqual(
		(result.symbolModules.armEscalationCandidates ?? []).map((candidate) => candidate.symbolId),
	);
});

test('a page that also renders a component whose interface the compile lacks keeps the refusal', async () => {
	const result = await compileTsrxModule({
		filename: 'src/accounts.tsrx',
		source: OWN_STATE_CHILD + UNLINKED_RENDER,
		symbols: [],
	});
	expect(codes(result)).toContainEqual(['MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED', 'error']);
});

test('the same page ships once the compile is given that interface', async () => {
	const badge = await compileTsrxModule({
		filename: 'src/unlinked-badge.tsrx',
		source: 'export function Badge() @{\n\t<b>new</b>\n}\n',
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/accounts.tsrx',
		source: OWN_STATE_CHILD + UNLINKED_RENDER,
		symbols: [],
		importedModuleInterfaces: { './unlinked-badge.tsrx': badge.moduleGraphInterface },
	});
	expect(codes(result)).not.toContainEqual(['MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED', 'error']);
});
