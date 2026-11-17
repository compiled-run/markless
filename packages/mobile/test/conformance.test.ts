import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileNativeComponent,
	createNativeRuntime,
	nativeConformance,
	nativeStyleInput,
} from '../src/index.ts';
import { CONFORMANCE_CASES } from './conformance-cases.ts';

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const committed = (name: string) =>
	JSON.parse(readFileSync(new URL(`../conformance/${name}`, import.meta.url), 'utf8')) as unknown;

describe('native conformance vectors', () => {
	it('the committed counter vectors are what the compiler and the reference runtime produce today', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'src/counter.tsrx',
			source: fixture('Counter.tsrx'),
		});
		expect(diagnostics).toEqual([]);
		const vectors = nativeConformance(payload!, CONFORMANCE_CASES[0]!.actions);
		expect(vectors.initial).toEqual([
			['h1:text0', 'Counter'],
			['h2:text0', 'Count 0'],
		]);
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[{ op: 'text', node: 'h2:text0', value: 'Count 1' }],
			[{ op: 'text', node: 'h2:text0', value: 'Count 2' }],
		]);
		expect(committed('counter.json')).toEqual(vectors);
	});

	it('every committed vector file matches a fresh build (rewrite with test/write-conformance.ts)', async () => {
		for (const entry of CONFORMANCE_CASES) {
			const { payload } = await compileNativeComponent({
				filename: `src/${entry.name}.tsrx`,
				...(entry.page ? { page: entry.page } : {}),
				source: readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8'),
			});
			expect(committed(`${entry.name}.json`), entry.name).toEqual(
				nativeConformance(payload!, entry.actions, entry.params),
			);
		}
	});

	it('journals only the text nodes whose string changed, in document order', () => {
		const runtime = createNativeRuntime({
			version: 'markless.native-view/0',
			component: 'Pair',
			cells: [
				{ id: 'state:a', name: 'a', initial: 1 },
				{ id: 'state:b', name: 'b', initial: 'fixed' },
			],
			nodes: [
				{ kind: 'element', id: 'h0', element: 'div', parent: null },
				{ kind: 'text', id: 'h0:text0', parent: 'h0', parts: [{ cell: 'state:b' }] },
				{
					kind: 'text',
					id: 'h0:text1',
					parent: 'h0',
					parts: [{ text: 'a=' }, { cell: 'state:a' }],
				},
			],
			events: [{ host: 'h0', event: 'activate', handler: 'handler:x' }],
			handlers: [
				{
					id: 'handler:x',
					ops: [
						{
							op: 'assign',
							cell: 'state:a',
							value: {
								binary: '-',
								left: { cell: 'state:a' },
								right: { literal: 1 },
							},
						},
						{
							op: 'assign',
							cell: 'state:a',
							value: {
								binary: '-',
								left: { cell: 'state:a' },
								right: { literal: 1 },
							},
						},
					],
				},
			],
		});
		expect(runtime.dispatch({ event: 'activate', host: 'h0' })).toEqual([
			{ op: 'text', node: 'h0:text1', value: 'a=-1' },
		]);
	});
});

describe('native style input', () => {
	it('hands Dragon the counter tree, its first texts and the scoped CSS the compiler wrote', async () => {
		const build = await compileNativeComponent({
			filename: 'src/counter.tsrx',
			source: fixture('Counter.tsrx'),
		});
		const input = nativeStyleInput(build.payload!, build.styles);
		expect(input.nodes.filter((node) => node.kind === 'text')).toEqual([
			{ kind: 'text', id: 'h1:text0', parent: 'h1', text: 'Counter' },
			{ kind: 'text', id: 'h2:text0', parent: 'h2', text: 'Count 0' },
		]);
		const scope = build.styles[0]!.scopeId;
		expect(input.nodes[3]).toMatchObject({
			id: 'h2',
			element: 'button',
			attributes: { class: `tap ${scope}` },
		});
		expect(input.css).toContain(`.tap.${scope}`);
	});
});
