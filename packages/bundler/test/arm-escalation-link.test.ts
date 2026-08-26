import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// Naming a branch export is what fulfils an escalation candidate. Only a
// fulfilled candidate loses the refusal the symbol-modules pass recorded.
const OWN_STATE_CHILD = `
import { state } from '@markless/core';

function Panel({ label }) @{
	let hits = state(0);
	<em class="panel" onClick={() => hits = hits + 1}>{label}{hits}</em>
}

export default function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Panel label="ready" /> }
	</main>
}
`;

test('a same-module component in an arm links a branch escalation symbol instead of refusing', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/PagePanel.tsrx',
		source: OWN_STATE_CHILD,
		environment: 'client',
	});
	const branchSymbol = result.manifest.symbols.find((symbol) => symbol.kind === 'branch-update');
	expect(branchSymbol).toBeDefined();
	const module = result.virtualModules.find(
		(candidate) => candidate.id === branchSymbol!.virtualModuleId,
	);
	expect(module?.source).toContain('renderPrerenderBranch');
	expect(module?.source).toContain('arm: context.arm');
});

// The server build ships no escalation symbol of its own, but it must not
// refuse the shape its own client build knows how to flip.
test('the server build of the same page compiles too', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/PagePanel.tsrx',
		source: OWN_STATE_CHILD,
		environment: 'server',
	});
	expect(result.manifest.symbols.some((symbol) => symbol.kind === 'branch-update')).toBe(false);
});

// The other way: a shape no page re-render answers is never a candidate, so the
// refusal still blocks the build.
test('an imported child in an arm is still refused', async () => {
	const child = await transformTsrxModule({
		filename: '/workspace/app/src/Counter.tsrx',
		source: `
import { state } from '@markless/core';

export function Counter({ label }) @{
	let hits = state(0);
	<em class="counter" onClick={() => hits = hits + 1}>{label}{hits}</em>
}
`,
		environment: 'client',
	});
	await expect(
		transformTsrxModule({
			filename: '/workspace/app/src/Host.tsrx',
			source: `
import { state } from '@markless/core';
import { Counter } from './Counter.tsrx';

export default function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Counter label="ready" /> }
	</main>
}
`,
			environment: 'client',
			importedModuleInterfaces: { './Counter.tsrx': child.manifest.moduleGraphInterface },
		}),
	).rejects.toThrow(/MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED/);
});
