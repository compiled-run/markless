import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const RESET_IMPORT = '@markless/web/fns/catch-reset';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const callbackProps = result.symbolModules.modules.filter((module) => module.kind === 'callback-prop');
	return {
		codes: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		callbackProps: callbackProps.map((module) => module.source),
	};
}

const balancePage = (catchArm: string) => `import { computed, state } from '@markless/core';

function RetryButton({ onRetry }) @{
	<button type="button" onClick={onRetry}>Retry</button>
}

export function Balance() @{
	let account = state('ok');
	const balance = computed(async () => {
		const which = account;
		await null;
		if (which === 'closed') throw new Error('Account closed');
		return { amount: 10 };
	});

	<div>
		@try {
			<output>{balance.amount}</output>
		} ${catchArm}
	</div>
}`;

test('reset handed to a child component bare, as onRetry={reset}, lowers to a zero-argument catch-reset callback', async () => {
	const { codes, callbackProps } = await compile(
		balancePage('@catch (error, reset) { <RetryButton onRetry={reset} /> }'),
	);
	expect(codes).toEqual([]);
	const prop = callbackProps.find((source) => source.includes(RESET_IMPORT));
	expect(prop).toBeDefined();
	expect(prop).toContain('"computed:balance"');
});

test('reset handed to a child component through an inline arrow also lowers to a catch-reset call', async () => {
	const { codes, callbackProps } = await compile(
		balancePage('@catch (error, reset) { <RetryButton onRetry={() => reset()} /> }'),
	);
	expect(codes).toEqual([]);
	const prop = callbackProps.find((source) => source.includes(RESET_IMPORT));
	expect(prop).toBeDefined();
	expect(prop).toContain('"computed:balance"');
});

test('reset forwarded through two levels of child components still reaches a catch-reset call at the first edge', async () => {
	const { codes, callbackProps } = await compile(`import { computed, state } from '@markless/core';

function RetryButton({ onRetry }) @{
	<button type="button" onClick={onRetry}>Retry</button>
}

function RetryPanel({ onRetry }) @{
	<RetryButton onRetry={onRetry} />
}

export function Balance() @{
	let account = state('ok');
	const balance = computed(async () => {
		const which = account;
		await null;
		if (which === 'closed') throw new Error('Account closed');
		return { amount: 10 };
	});

	<div>
		@try {
			<output>{balance.amount}</output>
		} @catch (error, reset) {
			<RetryPanel onRetry={reset} />
		}
	</div>
}`);
	expect(codes).toEqual([]);
	const prop = callbackProps.find((source) => source.includes(RESET_IMPORT));
	expect(prop).toBeDefined();
	expect(prop).toContain('"computed:balance"');
});
