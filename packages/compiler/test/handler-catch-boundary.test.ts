import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const HANDLER_CATCH_IMPORT = '@markless/web/fns/handler-catch';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const handlers = result.symbolModules.modules.filter(
		(module) => module.kind === 'event-handler' || module.kind === 'callback-prop',
	);
	return {
		codes: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		handlers: handlers.map((module) => module.source),
	};
}

const page = (catchArm: string) => `import { computed, state } from '@markless/core';

export function Page() @{
	let note = state('idle');
	const report = computed(async () => {
		await null;
		return { days: 7 };
	});

	<div>
		@try {
			<>
				<output>{report.days}</output>
				<button type="button" onClick={async () => { note = 'saving'; await Promise.reject(new Error('boom')); }}>Save</button>
			</>
		} ${catchArm}
	</div>
}`;

test("an async handler inside a @try with a @catch fails that boundary's own gate, not the value it reads", async () => {
	const { codes, handlers } = await compile(page('@catch (error) { <p>{error.message}</p> }'));
	expect(codes).toEqual([]);
	const handler = handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toBeDefined();
	expect(handler).toContain('"computed:asyncGate:0"');
	expect(handler).not.toContain('"computed:report"');
});

test('a handler that returns a promise awaits it inside the catch', async () => {
	const { handlers } = await compile(
		page('@catch (error) { <p>{error.message}</p> }').replace(
			"async () => { note = 'saving'; await Promise.reject(new Error('boom')); }",
			'async () => Promise.reject(new Error(note))',
		),
	);
	const handler = handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toMatch(/return await/);
});

test('a plain (not async) handler is left unwrapped', async () => {
	const { handlers } = await compile(
		page('@catch (error) { <p>{error.message}</p> }').replace(
			"async () => { note = 'saving'; await Promise.reject(new Error('boom')); }",
			"() => { note = 'saving'; }",
		),
	);
	expect(handlers.some((source) => source.includes(HANDLER_CATCH_IMPORT))).toBe(false);
});

test("a handler inside a @catch arm reaches the enclosing @try's @catch, not its own", async () => {
	const { handlers } = await compile(`import { computed, state } from '@markless/core';

export function Page() @{
	let note = state('idle');
	const outer = computed(async () => { await null; return { total: 1 }; });
	const inner = computed(async () => { await null; return { days: 7 }; });

	<div>
		@try {
			<>
				<p>{outer.total}</p>
				@try {
					<output>{inner.days}</output>
				} @catch (innerError) {
					<button type="button" onClick={async () => { note = 'x'; await Promise.reject(new Error('boom')); }}>Report</button>
				}
			</>
		} @catch (outerError) {
			<p>{outerError.message}</p>
		}
	</div>
}`);
	const handler = handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toBeDefined();
	expect(handler).toContain('"computed:asyncGate:0"');
});

test('a handler inside a @try with no @catch anywhere up the chain is left unwrapped', async () => {
	const { codes, handlers } = await compile(page('@pending { <i>Loading</i> }'));
	expect(codes).toEqual([]);
	expect(handlers.some((source) => source.includes(HANDLER_CATCH_IMPORT))).toBe(false);
});

test('a handler inside a @try whose @catch has no async value to fail is left unwrapped', async () => {
	const { codes, handlers } = await compile(`import { state } from '@markless/core';

export function Page() @{
	let note = state('idle');

	<div>
		@try {
			<button type="button" onClick={async () => { note = 'saving'; await Promise.reject(new Error('boom')); }}>Save</button>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</div>
}`);
	expect(codes).toEqual([]);
	expect(handlers.some((source) => source.includes(HANDLER_CATCH_IMPORT))).toBe(false);
});

test('a handler nested two @try levels deep targets its own nearest @catch, not the outer one', async () => {
	const { codes, handlers } = await compile(`import { computed, state } from '@markless/core';

export function Page() @{
	let note = state('idle');
	const outer = computed(async () => {
		await null;
		return { total: 1 };
	});
	const inner = computed(async () => {
		await null;
		return { days: 7 };
	});

	<div>
		@try {
			<>
				<p>{outer.total}</p>
				@try {
					<>
						<output>{inner.days}</output>
						<button type="button" onClick={async () => { note = 'saving'; await Promise.reject(new Error('boom')); }}>Save</button>
					</>
				} @catch (innerError) {
					<p>{innerError.message}</p>
				}
			</>
		} @catch (outerError) {
			<p>{outerError.message}</p>
		}
	</div>
}`);
	expect(codes).toEqual([]);
	const handler = handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toBeDefined();
	expect(handler).toContain('"computed:asyncGate:1"');
	expect(handler).not.toContain('"computed:asyncGate:0"');
});
