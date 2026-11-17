import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRelativeModule } from '../src/harness/rung.ts';
import { compileNativeComponent, nativeConformance } from '../src/index.ts';
import { CONFORMANCE_CASES } from './conformance-cases.ts';

const ROOT_HANDLERS: Readonly<Record<string, number>> = { components: 0, route: 0 };

// Everything a host is checked against except the payload itself, which differs by design.
const steps = (vectors: ReturnType<typeof nativeConformance>) => ({ ...vectors, payload: undefined });

// Proof only (handler-boundary.md): the same vector actions give the same journals whether a handler runs as data or in
// the reference JavaScript engine, so one set of test files holds both paths to one meaning.
describe('a handler means the same as data and as script', () => {
	for (const entry of CONFORMANCE_CASES) {
		it(entry.name, async () => {
			const build = (scriptHandlers?: 'all') =>
				compileNativeComponent({
					filename: `src/${entry.name}.tsrx`,
					...(entry.page ? { page: entry.page } : {}),
					source: readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8'),
					readModule: readRelativeModule,
					...(scriptHandlers ? { scriptHandlers } : {}),
				});
			const [data, script] = await Promise.all([build(), build('all')]);
			expect(script.diagnostics).toEqual([]);
			const scripted = script.payload!.handlers.filter((handler) => handler.ops.some((op) => op.op === 'script'));
			// A child component's handlers and a router link stay data: the proof scripts only the page's own handlers.
			expect(scripted.length, 'handlers that run as script').toBe(ROOT_HANDLERS[entry.name] ?? data.payload!.handlers.length);
			expect(steps(nativeConformance(script.payload!, entry.actions, entry.params))).toEqual(
				steps(nativeConformance(data.payload!, entry.actions, entry.params)),
			);
		});
	}

	it('a handler that throws in the engine changes nothing, and the next one still runs', async () => {
		const { payload } = await compileNativeComponent({
			filename: 'proofs-handlers/h5-page/App.tsrx',
			source: readFileSync(join(import.meta.dirname, '../proofs-handlers/h5-page/App.tsrx'), 'utf8'),
			scriptHandlers: 'fallback',
		});
		const vectors = nativeConformance(payload!, [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
		]);
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[],
			[{ op: 'text', node: 'h3:text0', value: 'Taps 1' }],
		]);
	});

	it('a timer the script asks for is a journal entry, and firing it runs the callback', async () => {
		const { payload } = await compileNativeComponent({
			filename: 'proofs-handlers/h1-timer/App.tsrx',
			source: readFileSync(join(import.meta.dirname, '../proofs-handlers/h1-timer/App.tsrx'), 'utf8'),
			scriptHandlers: 'fallback',
		});
		const vectors = nativeConformance(payload!, [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h1' },
			{ event: 'timer', id: 1 },
			{ event: 'timer', id: 2 },
		]);
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[
				{ op: 'text', node: 'h1:text0', value: 'Reload 1' },
				{ op: 'text', node: 'h2:text0', value: 'Page loading' },
				{ op: 'timer', id: 1, ms: 3000 },
			],
			[
				{ op: 'text', node: 'h1:text0', value: 'Reload 2' },
				{ op: 'timer', id: 2, ms: 3000 },
			],
			[],
			[{ op: 'text', node: 'h2:text0', value: 'Page done' }],
		]);
	});
});
