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

test('a handler inside a @try that reads no async value fails the gate minted for that boundary', async () => {
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
	const handler = handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toContain('"computed:asyncGate:0"');
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

test('a plain handler that returns a promise hands it to the catch; one that only starts a promise is left unwrapped', async () => {
	const returning = await compile(
		page('@catch (error) { <p>{error.message}</p> }').replace(
			"async () => { note = 'saving'; await Promise.reject(new Error('boom')); }",
			"() => { note = 'saving'; return Promise.reject(new Error('boom')); }",
		),
	);
	const handler = returning.handlers.find((source) => source.includes(HANDLER_CATCH_IMPORT));
	expect(handler).toMatch(/return marklessHandlerCatchReturned\(context\.graph, "computed:asyncGate:0", /);
	expect(handler).not.toMatch(/async function/);

	const concise = await compile(
		page('@catch (error) { <p>{error.message}</p> }').replace(
			"async () => { note = 'saving'; await Promise.reject(new Error('boom')); }",
			'() => Promise.reject(new Error(note))',
		),
	);
	expect(concise.handlers.some((source) => source.includes('marklessHandlerCatchReturned'))).toBe(true);

	const floating = await compile(
		page('@catch (error) { <p>{error.message}</p> }').replace(
			"async () => { note = 'saving'; await Promise.reject(new Error('boom')); }",
			"() => { note = 'saving'; Promise.reject(new Error('boom')); }",
		),
	);
	expect(floating.handlers.some((source) => source.includes(HANDLER_CATCH_IMPORT))).toBe(false);
});

test("a component inside a @try with a @catch gives that boundary its own gate and marks it as catching its handlers", async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { computed, state } from '@markless/core';

function Saver() @{
	let note = state('idle');
	<button type="button" onClick={async () => { note = 'saving'; await Promise.reject(new Error('boom')); }}>{note}</button>
}

export function Page() @{
	const report = computed(async () => { await null; return { days: 7 }; });
	<div>
		@try {
			<>
				<output>{report.days}</output>
				<Saver />
			</>
		} @catch (error) {
			<p>{error.message}</p>
		}
		@try {
			<output>{report.days}</output>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</div>
}`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
	const boundaries = result.protocolView.asyncBoundaries;
	expect(boundaries.map((boundary) => boundary.catchesHandlers === true)).toEqual([true, false]);
	expect(boundaries[0]!.runnerGraphNodeId).toBe('computed:asyncGate:0');
	expect(boundaries[1]!.runnerGraphNodeId).toBe('computed:report');
});

test('a component whose handlers cannot reject leaves the boundary on its own value, and its module says which components can', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Children.tsrx',
		source: `import { state } from '@markless/core';

export function Quiet() @{
	let count = state(0);
	<button type="button" onClick={() => (count = count + 1)}>{count}</button>
}

export function Loud() @{
	let note = state('idle');
	<button type="button" onClick={() => { note = 'saving'; return Promise.reject(new Error('boom')); }}>{note}</button>
}

export function Wrapper() @{
	<section><Loud /></section>
}`,
		symbols: [],
	});
	const published = child.moduleGraphInterface.render.components.map((component) => [
		component.componentName,
		component.rejectingHandlers === true,
	]);
	expect(published).toEqual([
		['Quiet', false],
		['Loud', true],
		['Wrapper', true],
	]);

	const page = (tag: string) => `import { computed } from '@markless/core';
import { ${tag} } from './Children.tsrx';

export function Page() @{
	const report = computed(async () => { await null; return { days: 7 }; });
	<div>
		@try {
			<>
				<output>{report.days}</output>
				<${tag} />
			</>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</div>
}`;
	const runners = async (tag: string) => {
		const result = await compileTsrxModule({
			filename: 'src/Page.tsrx',
			source: page(tag),
			symbols: [],
			importedModuleInterfaces: { './Children.tsrx': child.moduleGraphInterface },
		});
		return result.protocolView.asyncBoundaries.map((boundary) => [
			boundary.runnerGraphNodeId,
			boundary.catchesHandlers === true,
		]);
	};
	expect(await runners('Quiet')).toEqual([['computed:report', false]]);
	expect(await runners('Wrapper')).toEqual([['computed:asyncGate:0', true]]);
});
