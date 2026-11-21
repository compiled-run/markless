import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NativeOp, NativeViewPayload } from '@markless/serializer';
import {
	compileNativeComponent,
	createNativeAppRuntime,
	createNativeRuntime,
	type NativeAction,
} from '../src/index.ts';
import { compileRungApp, readWorkspaceModule } from '../src/harness/rung.ts';
import { nodeScriptHost } from '../src/node-engine.ts';
import { CONFORMANCE_CASES, readCaseModule } from './conformance-cases.ts';

// Both meanings of a handler: as data, and as its own JavaScript in the engine. Every committed vector is built twice,
// once as the compiler chooses and once with every handler a script can run forced into the engine; what each shows and
// journals must be the same.

const build = async (
	entry: (typeof CONFORMANCE_CASES)[number],
	scriptHandlers?: 'all' | 'never',
) => {
	const { payload, diagnostics } = await compileNativeComponent({
		filename: entry.modules ? `packages/mobile/${entry.fixture}` : `src/${entry.name}.tsrx`,
		...(entry.page ? { page: entry.page } : {}),
		...(entry.device ? { device: entry.device } : {}),
		readModule: entry.modules ? readWorkspaceModule : readCaseModule,
		...(scriptHandlers ? { scriptHandlers } : {}),
		source: readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8'),
	});
	expect(
		diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
		entry.name,
	).toEqual([]);
	return payload!;
};

const look = (
	payload: NativeViewPayload,
	actions: ReadonlyArray<NativeAction>,
	params?: Readonly<Record<string, string>>,
	preferredLanguages?: ReadonlyArray<string>,
	now?: number,
) => {
	const runtime = createNativeRuntime(
		payload,
		new Map(),
		params,
		preferredLanguages,
		now === undefined ? undefined : () => now,
		nodeScriptHost('00'.repeat(32)),
	);
	const screen = () => ({
		texts: runtime.texts(),
		attributes: runtime.attributes(),
		properties: runtime.properties(),
		arms: runtime.arms(),
		rows: runtime.rows(),
	});
	const start = runtime.start();
	return {
		initial: { start, ...screen() },
		// Style-state entries follow what the build knows of a cell's values, which a cell JavaScript writes does not show.
		steps: actions.map((action) => ({
			journal: runtime.dispatch(action).filter((entry) => entry.op !== 'state'),
			...screen(),
		})),
	};
};

const scriptOps = (payload: NativeViewPayload): number => {
	const count = (ops: ReadonlyArray<NativeOp>): number =>
		ops.reduce(
			(total, op) =>
				total +
				(op.op === 'script' ? 1 : 0) +
				(op.op === 'if' ? count(op.whenTrue) + count(op.whenFalse) : 0) +
				(op.op === 'call' && op.after ? count(op.after.ops) : 0),
			0,
		);
	return payload.handlers.reduce((total, handler) => total + count(handler.ops), 0);
};

describe('a handler means the same as data and as JavaScript', () => {
	// The clock vector fixes the data path's clock; the engine reads the device's own, which is that clock on a phone.
	it.each(
		CONFORMANCE_CASES.filter((entry) => entry.now === undefined).map(
			(entry) => [entry.name, entry] as const,
		),
	)('%s', async (_name, entry) => {
		const chosen = await build(entry);
		const forced = await build(entry, 'all');
		expect(look(forced, entry.actions, entry.params)).toEqual(
			look(chosen, entry.actions, entry.params),
		);
	});

	it('forces most handlers of the vectors into the engine, so the comparison covers them', async () => {
		// Handlers that read focus, `contains` or an event's target element stay data; the triggers, which call the family's
		// shared methods, and popover's focus landing, which focuses a handle through its proxy, run as JavaScript.
		const elementCases = new Map([
			['overlay', 4],
			['popover', 2],
		]);
		let data = 0;
		let forced = 0;
		for (const entry of CONFORMANCE_CASES) {
			const chosen = await build(entry);
			const moved = scriptOps(await build(entry, 'all')) - scriptOps(chosen);
			if (elementCases.has(entry.name)) {
				expect(moved, entry.name).toBe(elementCases.get(entry.name));
				continue;
			}
			data += chosen.handlers.length - scriptOps(chosen);
			forced += moved;
		}
		expect(forced).toBeGreaterThan(data / 2);
	});

	it('runs the J1 handler, outside the data vocabulary, only as JavaScript; data alone refuses it by name', async () => {
		const entry = CONFORMANCE_CASES.find((candidate) => candidate.name === 'script-loop')!;
		const chosen = await build(entry);
		expect(chosen.handlers.map((handler) => handler.ops.map((op) => op.op))).toEqual([
			['script'],
			['assign'],
		]);
		const { payload, diagnostics } = await compileNativeComponent({
			filename: `packages/mobile/${entry.fixture}`,
			source: readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8'),
			readModule: readWorkspaceModule,
			scriptHandlers: 'never',
		});
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message).sort()).toEqual([
			'the click handler reads `count`, which is not state of this component',
			'the click handler uses a ForOfStatement, which needs a script engine',
			'the click handler uses a `let` declaration, which needs a script engine',
			'the function `slug` loops over a list known only while the app runs',
		]);
	});

	it('refuses J7, a handler that touches document, at build time by name, file and line', async () => {
		const filename = 'packages/mobile/proofs/j7-page-refused/App.tsrx';
		const source = readFileSync(
			join(import.meta.dirname, '../proofs/j7-page-refused/App.tsrx'),
			'utf8',
		);
		const { payload, diagnostics } = await compileNativeComponent({ filename, source });
		expect(payload).toBeNull();
		const lineOf = (offset: number) => source.slice(0, offset).split('\n').length;
		expect(
			diagnostics.map((diagnostic) => [
				diagnostic.code,
				diagnostic.message,
				diagnostic.primarySpan?.filename,
				lineOf(diagnostic.primarySpan!.start),
				source.slice(diagnostic.primarySpan!.start, diagnostic.primarySpan!.end),
			]),
		).toEqual([
			[
				'MARKLESS_NATIVE_JAVASCRIPT',
				'the click handler uses `document`: the web page, which a phone does not have',
				filename,
				10,
				'document',
			],
		]);
	});

	it('starts no engine for a page with no script, through every vector it renders and dispatches', async () => {
		let plain = 0;
		for (const entry of CONFORMANCE_CASES) {
			const payload = await build(entry);
			if (payload.script) continue;
			plain++;
			const host = nodeScriptHost();
			const runtime = createNativeRuntime(
				payload,
				new Map(),
				entry.params,
				entry.preferredLanguages,
				entry.now === undefined ? undefined : () => entry.now!,
				host,
			);
			runtime.texts();
			runtime.attributes();
			runtime.rows();
			for (const action of entry.actions) runtime.dispatch(action);
			expect(host.starts(), entry.name).toBe(0);
		}
		expect(plain).toBeGreaterThan(20);
	});

	it('starts the engine for the screen whose first render needs it, at that render, and never for the screen beside it', async () => {
		const { payload } = await compileRungApp(
			join(import.meta.dirname, '../proofs/j10-first-render'),
		);
		const home = nodeScriptHost();
		createNativeAppRuntime(payload!, '/', new Map(), home).screens().at(-1)!.runtime.texts();
		expect(home.starts()).toBe(0);
		const words = nodeScriptHost();
		const opened = createNativeAppRuntime(payload!, '/words', new Map(), words)
			.screens()
			.at(-1)!.runtime;
		expect(words.starts()).toBe(0);
		expect(opened.texts().map(([, text]) => text)).toContain('Initials: KFB');
		expect(words.starts()).toBe(1);
	});
});
