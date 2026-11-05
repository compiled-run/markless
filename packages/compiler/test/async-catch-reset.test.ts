import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const RENDER_LOCAL = 'MARKLESS_HANDLER_READS_RENDER_LOCAL';
const RESET_IMPORT = '@markless/web/fns/catch-reset';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const handlers = result.symbolModules.modules.filter((module) => module.kind === 'event-handler');
	return {
		codes: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		messages: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.message),
		handlers: handlers.map((module) => module.source),
	};
}

const balancePage = (catchArm: string, before = '') => `import { computed, state } from '@markless/core';

export function Balance() @{
	let account = state('ok');
	${before}
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

test('@catch (error, reset) lets a handler call reset, which re-runs the block\'s async values', async () => {
	for (const arm of [
		'@catch (error, reset) { <button onClick={reset}>Retry</button> }',
		'@catch (error, reset) { <button onClick={() => reset()}>Retry</button> }',
		'@catch (error, reset) { <button onClick={() => { account = \'ok\'; reset(); }}>Retry</button> }',
	]) {
		const { codes, handlers } = await compile(balancePage(arm));
		expect(codes, arm).toEqual([]);
		const handler = handlers.find((source) => source.includes(RESET_IMPORT));
		expect(handler, arm).toBeDefined();
		expect(handler, arm).toContain('"computed:balance"');
		expect(handler, arm).not.toMatch(/(?<![-\w])reset(?![-\w])/);
	}
});

test('a renamed reset in a different shape resets every async value its block reads', async () => {
	const { codes, handlers } = await compile(`import { computed, state } from '@markless/core';

export function Orders() @{
	let region = state('eu');
	const orders = computed(async () => {
		const where = region;
		await null;
		return [{ id: where }];
	});
	const totals = computed(async () => {
		await null;
		return { sum: 3 };
	});
	const fallback = computed(async () => {
		await null;
		return 'other';
	});

	<section>
		<p>{fallback}</p>
		@try {
			<>
				<ul>
					@for (const order of orders; key order.id) {
						<li>{order.id}</li>
					}
				</ul>
				<strong>{totals.sum}</strong>
			</>
		} @pending {
			<i>Loading</i>
		} @catch (failure, again) {
			<a href="#" onClick={(event) => { event.preventDefault(); again(); }}>Load again</a>
		}
	</section>
}`);
	expect(codes.filter((code) => code === RENDER_LOCAL)).toEqual([]);
	const handler = handlers.find((source) => source.includes(RESET_IMPORT))!;
	expect(handler).toBeDefined();
	expect(handler).toContain('"computed:orders"');
	expect(handler).toContain('"computed:totals"');
	expect(handler).not.toContain('"computed:fallback"');
	expect(handler).not.toMatch(/(?<![-\w])again(?![-\w])/);
});

test('a parameter that shadows reset is the parameter, not the boundary function', async () => {
	const { handlers } = await compile(
		balancePage('@catch (error, reset) { <button onClick={(reset) => console.log(reset)}>Log</button> }'),
	);
	expect(handlers.some((source) => source.includes(RESET_IMPORT))).toBe(false);
});

test('a handler in @catch still refuses a body local the browser cannot recompute', async () => {
	const local = await compile(
		balancePage(
			'@catch (error, reset) { <button onClick={() => { console.log(stamp); reset(); }}>Retry</button> }',
			'let stamp = Date.now();',
		),
	);
	expect(local.codes).toContain(RENDER_LOCAL);
	expect(local.messages.join('\n')).toContain('reads `stamp`');
	const error = await compile(
		balancePage('@catch (error, reset) { <button onClick={() => console.log(error)}>Log</button> }'),
	);
	expect(error.codes).toContain(RENDER_LOCAL);
	expect(error.messages.join('\n')).toContain('reads `error`');
});

test('reset lists the async values a block reads upstream first, each with the async values it reads', async () => {
	const { handlers } = await compile(`import { computed, state } from '@markless/core';

export function Team() @{
	let team = state('core');
	const members = computed(async () => {
		const which = team;
		await null;
		return [which];
	});
	const count = computed(() => members.length);
	const roster = computed(async () => {
		const size = count;
		await null;
		return { size };
	});

	<div>
		@try {
			<output>{roster.size}</output>
		} @catch (error, reset) {
			<button onClick={reset}>Retry</button>
		}
	</div>
}`);
	const handler = handlers.find((source) => source.includes(RESET_IMPORT))!;
	expect(handler.replace(/\s+/g, '')).toContain(
		'[["computed:members"],["computed:roster","computed:members"]]',
	);
});
