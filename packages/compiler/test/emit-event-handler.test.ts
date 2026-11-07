/**
 * Parity for `emitEventHandlerModule`, stage 1's largest and riskiest emitter in
 * `specs/framework/14-emission-codegen-migration.md` (sketch item 5).
 *
 * Both paths run here: the spliced string the compiler emits today, and the tree
 * the additive band builds and prints through `emit-codegen.ts`. Nothing swaps
 * the wired path — `emitEventHandlerModule` still produces the bytes the
 * compiler ships, and `SYMBOL_MODULE_AST_KINDS` still does not list these two
 * kinds. What this file produces is the evidence the owner's re-baseline
 * decision (invariant 2) needs: where the two paths agree, where their bytes
 * differ and by which named class, and that the difference is layout rather than
 * behavior.
 *
 * It also settles the one question the specification assigns to this unit:
 * **comment migration across a move**. See `comment classes survive the move
 * into a synthesized module` below. Short answer: they do — three authored
 * positions carried across the move, and the two comments the emitter writes
 * itself — and the one place a comment changes the *shape* of the emitted
 * module, the scalar-leaf gate, was matched to the string path deliberately
 * rather than left to diverge.
 *
 * The last band of tests covers guarded and optional callback invocations, where
 * the captured prop sits in callee position and a rewrite that took one node too
 * many would delete the author's guard.
 */
import { expect, test } from 'vitest';
import type { GeneratedSymbolModule, PlannedSymbol } from '../src/artifacts.ts';
import { compileTsrxModule } from '../src/compile-module.ts';
import {
	assertDeterministicEmission,
	EMISSION_TSRX_NODE_CODE,
	EmissionDiagnosticError,
	findTsrxOnlyNodeType,
	parseEmissionSource,
	printEmittedModule,
	type EmissionNode,
} from '../src/passes/emit-codegen.ts';
import {
	buildEventHandlerEmission,
	emitEventHandlerModuleNodes,
	emitSymbolModules,
	eventHandlerRowLocalNames,
	type EventHandlerEmissionInput,
} from '../src/passes/symbol-modules.ts';

type Fixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
	/** Which emitted module is the one under test, when a fixture yields two. */
	readonly pick?: (module: GeneratedSymbolModule) => boolean;
};

const FIXTURES: ReadonlyArray<Fixture> = [
	{
		// The scalar-write leaf, updater form. The only module shape that carries
		// the `/* scalar leaf marker: ... */` comment, and the only one whose
		// import the emitter writes rather than forwards.
		name: 'scalar-leaf-step',
		filename: '/workspace/app/src/Counter.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let weight = state(0);
	<main onClick={() => weight++}>{weight}</main>
}`,
	},
	{
		// The scalar-write leaf, value form, with a row local: the value is
		// `context.locals?.update?.id`, which exercises the local-name rewrite
		// inside the leaf rather than inside a spliced body.
		name: 'scalar-leaf-local',
		filename: '/workspace/app/src/Feed.tsrx',
		source: `import { state } from '@markless/core';
export default function Feed() @{
	let selectedKey = state('none');
	const updates = state([{ id: 'one', project: 'compiler' }]);
	<ul>
		@for (const update of updates; key update.id) {
			<li onClick={() => selectedKey = update.id}>{update.project}</li>
		}
	</ul>
}`,
	},
	{
		// The leaf gate's other half: guard calls are allowed alongside the write,
		// so this stays a leaf while anything else in the body would not.
		name: 'guarded-scalar-leaf',
		filename: '/workspace/app/src/Guarded.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let open = state(false);
	<button onClick={(event) => { event.preventDefault(); open = true; }}>{open}</button>
}`,
	},
	{
		// An imported handler reference, event call form.
		name: 'imported-reference',
		filename: '/workspace/app/src/Save.tsrx',
		source: `import { save } from './api.ts';
export function App() @{
	<button onClick={save}>Save</button>
}`,
	},
	{
		// An authored body with three write shapes at once: a compound assignment
		// lowered to `graph.update`, a `delete` lowered to `graph.delete`, and a
		// plain assignment from an event field lowered to `graph.write`. The
		// compound assignment's right-hand side is itself a graph read, so it also
		// covers a read nested inside a write's value.
		name: 'authored-body-writes',
		filename: '/workspace/app/src/Form.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	const profile = state({ step: 2, tags: { a: 1 } });
	<form onSubmit={(event) => {
		event.preventDefault();
		count += profile.step;
		delete profile.tags;
		count = event.target.value;
	}}>{count}</form>
}`,
	},
	{
		// A method call on state, lowered to `graph.call` with an argument vector.
		name: 'method-call-write',
		filename: '/workspace/app/src/List.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	const items = state(['a']);
	<button onClick={() => items.push('b')}>add</button>
}`,
	},
	{
		// The comment fixture. Three positions in one body: a leading line
		// comment, a leading block comment, and a trailing same-line comment, all
		// on the statement whose expression the emitter replaces.
		name: 'commented-body',
		filename: '/workspace/app/src/Commented.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<button onClick={(event) => {
		// a leading line comment
		/* a leading block comment */
		count = 4; // a trailing comment
	}}>{count}</button>
}`,
	},
	{
		// Capture slots: a child component's handler reads a captured prop and
		// invokes a captured callback, so the printed body carries both
		// `context.capture.read` and `await context.capture.invoke`, and the
		// invocation's arguments carry a read and an event field.
		name: 'capture-child-handler',
		filename: '/workspace/app/src/Captures.tsrx',
		source: `function Child({ label, onTrace }: { label: string; onTrace: (payload: { value: number }, reason: string) => void }) @{
	<button onClick={(event) => onTrace({ value: label.length }, event.type)}>{label}</button>
}
export function App() @{
	<Child label="Save" onTrace={(payload) => console.log(payload.value)} />
}`,
		pick: (module) => module.kind === 'event-handler',
	},
	{
		// The callback-prop kind, in its argument-vector parameter form: the one
		// place the emitter writes the `/* legacy callback binding was: ... */`
		// comment.
		name: 'capture-callback-prop',
		filename: '/workspace/app/src/Captures.tsrx',
		source: `function Child({ label, onTrace }: { label: string; onTrace: (payload: { value: number }, reason: string) => void }) @{
	<button onClick={(event) => onTrace({ value: label.length }, event.type)}>{label}</button>
}
export function App() @{
	<Child label="Save" onTrace={(payload) => console.log(payload.value)} />
}`,
		pick: (module) => module.kind === 'callback-prop',
	},
	{
		// An empty body, which both paths answer with `void context;`.
		name: 'empty-body',
		filename: '/workspace/app/src/Empty.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<button onClick={() => {}}>{count}</button>
}`,
	},
];

type Paths = {
	readonly spliced: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: EventHandlerEmissionInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
	readonly mappings: string;
};

async function bothPaths(fixture: Fixture): Promise<Paths> {
	const result = await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
	});

	const pick =
		fixture.pick ??
		((module: GeneratedSymbolModule) =>
			module.kind === 'event-handler' || module.kind === 'callback-prop');
	const spliced = result.symbolModules.modules.find(pick);
	if (!spliced) {
		// The kinds and diagnostics are in the message because the usual reason a
		// handler fixture yields nothing is that capture analysis refused the
		// symbol, and the diagnostic code says which refusal it was.
		throw new Error(
			[
				`fixture ${fixture.name} produced no handler module`,
				`kinds=${JSON.stringify(result.symbolModules.modules.map((module) => module.kind))}`,
				`symbols=${JSON.stringify(result.symbolResolver.symbols.map((candidate) => candidate.kind))}`,
				`diagnostics=${JSON.stringify(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code))}`,
			].join('; '),
		);
	}

	const symbol = result.symbolResolver.symbols.find(
		(candidate: PlannedSymbol) => candidate.id === spliced.symbolId,
	);
	if (!symbol || (symbol.kind !== 'event-handler' && symbol.kind !== 'callback-prop')) {
		throw new Error(`fixture ${fixture.name} produced no handler symbol`);
	}

	// The same capture-slot and argument-vector selection `emitSymbolModules`
	// makes before it calls the emitter, so both paths see identical input.
	const extracted = result.captureAnalysis.extractedSymbols.find(
		(candidate) => !candidate.loaderSymbolId && candidate.symbolId === symbol.id,
	);
	const captureSlots = (extracted?.captureSlots ?? []).filter((slot) =>
		slot.routes.some((route) => route.componentEdgeId !== undefined),
	);
	const usesArgumentVector = result.captureAnalysis.extractedSymbols.some((candidate) =>
		candidate.captureSlots.some((slot) =>
			slot.routes.some(
				(route) => route.kind === 'callback-route' && route.callbackSymbolId === symbol.id,
			),
		),
	);

	const input: EventHandlerEmissionInput = {
		symbol,
		localNames: eventHandlerRowLocalNames(result.renderData, symbol.id),
		captureSlots,
		usesArgumentVector,
		sourceFileName: fixture.filename,
	};
	const emitted = emitEventHandlerModuleNodes(input);
	if (!emitted) throw new Error(`fixture ${fixture.name} printed no module`);

	return {
		spliced: spliced.source,
		printed: emitted.code,
		exportName: spliced.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
		mappings: emitted.map.mappings,
	};
}

/** Leading whitespace only. Tokens, blank lines, and line breaks stay put. */
function normalizeIndentation(code: string): string {
	return code
		.split('\n')
		.map((line) => line.replace(/^[\t ]+/, ''))
		.join('\n');
}

/** Non-blank lines, with leading whitespace removed. */
function meaningfulLines(code: string): string[] {
	return normalizeIndentation(code)
		.split('\n')
		.filter((line) => line.trim() !== '');
}

/**
 * Reprint a module through the same printer.
 *
 * Two modules that reprint to the same bytes differ only in what the printer
 * normalizes away — layout and blank lines. This is the parity claim that
 * survives the printer being normalizing rather than preserving.
 *
 * Module-specifier quotes are normalized before the reprint because the one
 * thing the printer does *not* re-derive is a quote: `quotes: 'preserve'` keeps
 * whatever a parsed literal carried in `raw`, so a reprint of the text path's
 * single-quoted scalar-leaf import stays single-quoted forever. That difference
 * is reported as its own class in `divergenceClasses` rather than hidden, and
 * normalizing it here is what lets the reprint answer the structural question.
 */
function reprint(code: string, filename: string): string {
	const normalized = code.replace(/ from '([^']*)';/g, ' from "$1";');
	const { program, errors } = parseEmissionSource(normalized, filename, 'ts');
	expect(errors).toEqual([]);
	return printEmittedModule({
		program,
		source: normalized,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: filename },
	}).code;
}

type Recorder = {
	readonly calls: string[];
	readonly context: Record<string, unknown>;
};

/**
 * A stub runtime context that records what the handler asked it to do.
 *
 * Both modules run against a fresh recorder and the two call logs are compared;
 * that is the behavior-equality half of the spec's per-site acceptance, which is
 * what matters at a site whose bytes are not equal.
 *
 * `captureValue` decides what a capture slot resolves to. The default stands in
 * for a captured string prop; the guarded-callback tests pass a function, or
 * `undefined` for the prop the parent never passed.
 */
function recordingContext(captureValue: (calls: string[]) => unknown = () => 'Save'): Recorder {
	const calls: string[] = [];
	const seed: Record<string, unknown> = { 'state:count': 10, 'state:profile': { step: 3 } };

	return {
		calls,
		context: {
			event: { type: 'submit', target: { value: 'typed' }, currentTarget: { id: 'host' } },
			args: [{ value: 7 }, 'because'],
			element: { id: 'host' },
			locals: { update: { id: 'one' } },
			graph: {
				read: (graphNodeId: string, path?: ReadonlyArray<string>) => {
					calls.push(`read ${graphNodeId} ${JSON.stringify(path ?? [])}`);
					const root = seed[graphNodeId];
					return path && path.length > 0
						? (root as Record<string, unknown> | undefined)?.[path[0] ?? '']
						: root;
				},
				write: (input: { graphNodeId: string; path: string[]; value: unknown }) => {
					calls.push(
						`write ${input.graphNodeId} ${JSON.stringify(input.path)} ${JSON.stringify(input.value)}`,
					);
				},
				update: (input: {
					graphNodeId: string;
					path: string[];
					returnValue: string;
					update: (value: unknown) => unknown;
				}) => {
					calls.push(
						`update ${input.graphNodeId} ${JSON.stringify(input.path)} ${input.returnValue} -> ${JSON.stringify(input.update(seed[input.graphNodeId] ?? 1))}`,
					);
				},
				delete: (input: { graphNodeId: string; path: string[] }) => {
					calls.push(`delete ${input.graphNodeId} ${JSON.stringify(input.path)}`);
				},
				call: (input: {
					graphNodeId: string;
					path: string[];
					method: string;
					args: unknown[];
				}) => {
					calls.push(
						`call ${input.graphNodeId} ${JSON.stringify(input.path)} ${input.method} ${JSON.stringify(input.args)}`,
					);
				},
			},
			capture: {
				read: (slotId: string) => {
					calls.push(`capture.read ${slotId}`);
					return captureValue(calls);
				},
				invoke: (slotId: string, args: unknown[]) => {
					calls.push(`capture.invoke ${slotId} ${JSON.stringify(args)}`);
					return Promise.resolve('invoked');
				},
			},
			getElementHandle: (handleName: string) => {
				calls.push(`handle ${handleName}`);
				return undefined;
			},
		},
	};
}

/**
 * Run an emitted handler module against a recorder.
 *
 * Imports are stripped and their bindings injected as parameters instead — the
 * two names an emitted handler module can import here are `marklessWriteScalar`,
 * which the emitter writes, and a fixture's own imported handler. `console` is
 * injected too, so the callback-prop fixture's body does not print during a run.
 */
async function runHandler(
	code: string,
	exportName: string,
	recorder: Recorder,
): Promise<string[]> {
	const stripped = code
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('import '))
		.join('\n');
	const stubs: Record<string, unknown> = {
		marklessWriteScalar: (context: unknown, input: Record<string, unknown>) => {
			const graph = (context as { graph: Record<string, (value: unknown) => unknown> }).graph;
			return input.update
				? graph.update({ ...input, path: [] })
				: graph.write({ ...input, path: [] });
		},
		save: (event: unknown) => {
			recorder.calls.push(`save ${JSON.stringify(event)}`);
			return 'saved';
		},
		console: { log: (value: unknown) => recorder.calls.push(`log ${JSON.stringify(value)}`) },
	};

	const names = Object.keys(stubs);
	const body = `${stripped.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	const entry = new Function(...names, body)(...names.map((name) => stubs[name])) as (
		context: unknown,
	) => unknown;
	await entry(recorder.context);
	return recorder.calls;
}

test('the printed handler module is structurally identical to the spliced one', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			reprint(paths.printed, fixture.filename),
			`${fixture.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, fixture.filename));
	}
});

test('both paths choose the same module shape for every fixture', async () => {
	const shapes: Record<string, string> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		const shapeOf = (code: string): string =>
			[
				code.includes('marklessWriteScalar') ? 'scalar-leaf' : 'general',
				code.includes(`export async function ${paths.exportName}`) ? 'async' : 'sync',
				`imports:${meaningfulLines(code).filter((line) => line.startsWith('import ')).length}`,
			].join('/');

		expect(shapeOf(paths.printed), `${fixture.name}: shape differs`).toBe(shapeOf(paths.spliced));
		shapes[fixture.name] = shapeOf(paths.printed);
	}

	// Stated rather than derived, so a shape that moves shows up as a failure
	// here instead of quietly passing the equality above.
	expect(shapes).toEqual({
		'scalar-leaf-step': 'scalar-leaf/sync/imports:1',
		'scalar-leaf-local': 'scalar-leaf/sync/imports:1',
		'guarded-scalar-leaf': 'scalar-leaf/sync/imports:1',
		'imported-reference': 'general/sync/imports:1',
		'authored-body-writes': 'general/sync/imports:0',
		'method-call-write': 'general/sync/imports:0',
		'commented-body': 'general/sync/imports:0',
		'capture-child-handler': 'general/async/imports:0',
		'capture-callback-prop': 'general/sync/imports:0',
		'empty-body': 'general/sync/imports:0',
	});
});

test('the printed and spliced handlers do the same thing to the runtime', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		const fromSpliced = await runHandler(paths.spliced, paths.exportName, recordingContext());
		const fromPrinted = await runHandler(paths.printed, paths.exportName, recordingContext());

		expect(fromPrinted, `${fixture.name}: runtime calls differ`).toEqual(fromSpliced);
	}
});

test('the swapped production path is byte-equal to the printed module', async () => {
	// The swap wired the event-handler build through `emitSymbolModuleNodes`, so
	// the module the compiler ships and the module this suite prints are one path.
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		expect(paths.spliced, `${fixture.name}: production diverged from the printed module`).toBe(
			paths.printed,
		);
	}
});

test('comment classes survive the move into a synthesized module', async () => {
	const carried = await bothPaths(FIXTURES.find((fixture) => fixture.name === 'commented-body')!);
	const leaf = await bothPaths(FIXTURES.find((fixture) => fixture.name === 'scalar-leaf-step')!);
	const legacy = await bothPaths(
		FIXTURES.find((fixture) => fixture.name === 'capture-callback-prop')!,
	);

	// Carried across the move: the parser attaches these to the statement whose
	// expression the emitter replaces, and the statement travels into a brand new
	// `Program`. This is the specification's open question, and the answer is yes
	// for all three positions.
	expect(carried.printed).toContain('// a leading line comment');
	expect(carried.printed).toContain('/* a leading block comment */');
	expect(carried.printed).toContain('; // a trailing comment');
	expect(carried.spliced).toContain('// a leading line comment');
	expect(carried.spliced).toContain('/* a leading block comment */');
	expect(carried.spliced).toContain('// a trailing comment');

	// Still attached to the statement it annotated, not floated to the top of the
	// module: the write it comments on sits between the leading comments and the
	// trailing one.
	const lines = meaningfulLines(carried.printed);
	const write = lines.findIndex((line) => line.startsWith('context.graph.write('));
	expect(write).toBeGreaterThan(1);
	expect(lines[write - 2]).toBe('// a leading line comment');
	expect(lines[write - 1]).toBe('/* a leading block comment */');
	expect(lines[write]).toContain('// a trailing comment');

	// Written by the emitter, through the foundation's `withLeadingBlockComment`.
	// `packages/bundler/test/rolldown.test.ts` asserts a scalar-leaf module still
	// contains `context.graph.update({`, which after the leaf rewrite lives only
	// inside this comment, so losing it in the print would break a downstream
	// package's test rather than only changing bytes.
	expect(leaf.printed).toContain('/* scalar leaf marker: context.graph.update({ */');
	expect(leaf.spliced).toContain('/* scalar leaf marker: context.graph.update({ */');

	// Written by the emitter, through the band-local `withTrailingBlockComment`.
	expect(legacy.printed).toContain(
		'/* legacy callback binding was: const payload = context.event; */',
	);
	expect(legacy.spliced).toContain(
		'/* legacy callback binding was: const payload = context.event; */',
	);
});

test('a comment in the body keeps both paths off the scalar-leaf shape', async () => {
	// The string path's leaf gate deletes the write from the body *text* and asks
	// whether anything but semicolons is left; a comment is left, so it refuses.
	// The AST gate refuses the same input deliberately: taking the leaf would
	// replace the whole body with one synthesized call and delete the author's
	// comment with it.
	const commented = await bothPaths(
		FIXTURES.find((fixture) => fixture.name === 'commented-body')!,
	);
	const bare = await bothPaths(FIXTURES.find((fixture) => fixture.name === 'scalar-leaf-step')!);

	expect(commented.spliced).not.toContain('marklessWriteScalar');
	expect(commented.printed).not.toContain('marklessWriteScalar');
	expect(bare.spliced).toContain('marklessWriteScalar');
	expect(bare.printed).toContain('marklessWriteScalar');
});

test('emission is deterministic and reaches a reparse fixpoint at this site', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		const emission = buildEventHandlerEmission(paths.input);
		expect(emission, `${fixture.name}: no emission`).not.toBeNull();

		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(emission!);

		expect(emitted.code).toBe(paths.printed);
	}
});

test('every printed handler module carries a non-null source map naming the authored file', async () => {
	const segmented: Record<string, boolean> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.mapSources, `${fixture.name}: map sources`).toEqual([fixture.filename]);
		expect(paths.mapFile, `${fixture.name}: map file`).toBe(`${paths.exportName}.js`);
		segmented[fixture.name] = paths.mappings.length > 0;
	}

	// A map is present and names the authored file everywhere (invariant 3), but
	// it only carries segments where an authored node survived into the printed
	// tree. A synthesized-whole module has no honest mapping to carry, which is
	// the same answer the DOM-binding band records for its own. `guarded-scalar-leaf`
	// is the interesting row: its leaf value is the author's own `true` literal,
	// reused rather than rebuilt so the quote and the span both survive, and that
	// one node is enough to give the module a segment.
	expect(segmented).toEqual({
		'scalar-leaf-step': false,
		'scalar-leaf-local': false,
		'guarded-scalar-leaf': true,
		'imported-reference': true,
		'authored-body-writes': true,
		'method-call-write': true,
		'commented-body': true,
		'capture-child-handler': true,
		'capture-callback-prop': true,
		'empty-body': false,
	});
});

test('the TSRX-node assertion is live at this site', async () => {
	const paths = await bothPaths(FIXTURES[0]!);
	const clean = buildEventHandlerEmission(paths.input)!;

	expect(findTsrxOnlyNodeType(clean.program)).toBeNull();

	const program = clean.program as unknown as { readonly body: EmissionNode[] };
	const poisoned = {
		...clean,
		program: {
			...program,
			body: [...program.body, { type: 'JSXCodeBlock' } as EmissionNode],
		} as unknown as EmissionNode,
	};

	expect(() => printEmittedModule(poisoned)).toThrowError(EmissionDiagnosticError);
	try {
		printEmittedModule(poisoned);
	} catch (error) {
		expect((error as EmissionDiagnosticError).diagnostic.code).toBe(EMISSION_TSRX_NODE_CODE);
	}
});

/**
 * The imported reference's argument-vector call form.
 *
 * This one shape is not reachable from authored source: a callback prop whose
 * value is a bare imported identifier is refused by capture analysis with
 * `MARKLESS_CAPTURE_OPAQUE_PROP`, so no fixture compiles to it. The symbol is
 * therefore built directly and handed to both paths, which is how
 * `symbol-modules.test.ts` covers the same corner of the string emitter.
 */
test('an imported callback reference with several parameters calls through the argument vector', () => {
	const symbol = {
		id: 'symbol:forward',
		kind: 'callback-prop' as const,
		componentEdgeId: 'component-edge:0',
		propName: 'onTrace',
		source: 'trace',
		parameters: ['value', 'reason'],
		moduleImports: [
			{ localName: 'trace', importedName: 'trace', source: './api.ts', kind: 'named' as const },
		],
	};

	const spliced = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [symbol],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	}).modules[0]!.source;

	const printed = emitEventHandlerModuleNodes({
		symbol,
		localNames: new Set<string>(),
		captureSlots: [],
		usesArgumentVector: false,
		sourceFileName: '/workspace/app/src/Forward.tsrx',
	})!.code;

	// A spread argument is an assignment expression, so `...context.args ?? []`
	// is the same tree as the parenthesized form the string path used to write.
	expect(spliced).toContain('return trace(...context.args ?? []);');
	expect(printed).toContain('import { trace } from "./api.ts";');
	expect(printed).toContain('return trace(...context.args ?? []);');
	expect(spliced).toBe(printed);
});

// ---------------------------------------------------------------------------
// Guarded and optional callback invocations.
//
// Five authored guard shapes, each around a prop the parent may not have
// passed: `onChange?.(...)`, `if (onChange) onChange(...)`,
// `onChange && onChange(...)`, `onChange != null ? onChange(...) : undefined`,
// and `typeof onChange === 'function' && onChange()`. All five put the captured
// prop in *callee* position, which is the position a rewrite is most likely to
// get wrong: replace too much and the guard disappears, replace too little and
// the emitted module still names a binding that does not exist in it.
//
// These are built as symbols rather than compiled from `.tsrx`, because at this
// lane's HEAD an optional prop the parent omits is refused by capture analysis
// with `MARKLESS_CAPTURE_OPAQUE_PROP` and the symbol never reaches an emitter —
// verified by compiling all five shapes, which produced zero handler modules.
// Building the symbol directly is how `symbol-modules.test.ts` reaches the same
// corners of the string emitter, and it is the only way to hold both paths to
// identical input for a shape the front end does not yet produce.
// ---------------------------------------------------------------------------

type GuardShape = {
	readonly name: string;
	readonly source: string;
	/** Whether the captured prop routes to a callback symbol or to a value. */
	readonly callbackRoute: boolean;
};

/**
 * Deliberately not spelled `capture-slot:onChange`: the leak assertion below
 * asks whether the identifier `onChange` appears anywhere in the emitted module,
 * and a slot id containing it would make that assertion unfalsifiable.
 */
const GUARD_SLOT_ID = 'capture-slot:7';

const GUARD_SHAPES: ReadonlyArray<GuardShape> = [
	{ name: 'optional-call', source: `() => onChange?.('next')`, callbackRoute: false },
	{
		name: 'if-guard',
		source: `() => { if (onChange) onChange('next'); }`,
		callbackRoute: false,
	},
	{
		name: 'logical-guard',
		source: `() => { onChange && onChange('next'); }`,
		callbackRoute: false,
	},
	{
		name: 'ternary-guard',
		source: `() => { onChange != null ? onChange('x') : undefined; }`,
		callbackRoute: false,
	},
	{
		name: 'typeof-guard',
		source: `() => { typeof onChange === 'function' && onChange(); }`,
		callbackRoute: false,
	},
	{
		// The same optional call, but the parent did pass a callback, so the slot
		// routes to a callback symbol and the invocation lowers to
		// `await context.capture.invoke(...)` instead of a call through a read.
		name: 'optional-call-bound',
		source: `() => onChange?.('next')`,
		callbackRoute: true,
	},
];

function guardSymbol(shape: GuardShape) {
	return {
		id: 'symbol:guard',
		kind: 'event-handler' as const,
		hostNodeId: 'h1',
		eventName: 'click',
		source: shape.source,
		parameters: [] as ReadonlyArray<string>,
		order: 0,
		reads: [{ source: 'onChange', graphNodeId: 'prop:onChange', path: [] as string[] }],
		writes: [],
	};
}

function guardSlot(shape: GuardShape) {
	return {
		id: GUARD_SLOT_ID,
		bindingId: 'binding:onChange',
		source: 'onChange',
		owner: {},
		path: [] as string[],
		routes: [
			shape.callbackRoute
				? {
						kind: 'callback-route' as const,
						componentEdgeId: 'component-edge:0',
						callbackSymbolId: 'symbol:parent-callback',
					}
				: {
						kind: 'compiler-known-constant' as const,
						componentEdgeId: 'component-edge:0',
						value: undefined,
					},
		],
	};
}

function guardPaths(shape: GuardShape): { readonly spliced: string; readonly printed: string } {
	const symbol = guardSymbol(shape);
	const slot = guardSlot(shape);

	const spliced = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [symbol],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [
				{ symbolId: symbol.id, kind: symbol.kind, source: symbol.source, captureSlots: [slot] },
			],
			diagnostics: [],
		},
	}).modules[0]!.source;

	const printed = emitEventHandlerModuleNodes({
		symbol,
		localNames: new Set<string>(),
		captureSlots: [slot],
		usesArgumentVector: false,
		sourceFileName: '/workspace/app/src/Guarded.tsrx',
	})!.code;

	return { spliced, printed };
}

test('every guarded callback shape prints the guard the author wrote', () => {
	const bodies: Record<string, string> = {};

	for (const shape of GUARD_SHAPES) {
		const paths = guardPaths(shape);

		expect(
			reprint(paths.printed, 'guarded.ts'),
			`${shape.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, 'guarded.ts'));

		// The captured prop is gone as a *binding* — nothing in the emitted module
		// names `onChange`, which would be a free variable there — while the guard
		// around it is still the one the author wrote.
		expect(paths.printed, `${shape.name}: leaked the captured binding`).not.toMatch(
			/(^|[^."'\w])onChange\b/,
		);
		bodies[shape.name] = meaningfulLines(paths.printed)[1] ?? '';
	}

	// The guard operator survives in every shape, stated line by line so a rewrite
	// that swallowed one would fail here rather than pass a looser check.
	expect(bodies).toEqual({
		'optional-call': `return context.capture.read("${GUARD_SLOT_ID}")?.('next');`,
		'if-guard': `if (context.capture.read("${GUARD_SLOT_ID}")) context.capture.read("${GUARD_SLOT_ID}")('next');`,
		'logical-guard': `context.capture.read("${GUARD_SLOT_ID}") && context.capture.read("${GUARD_SLOT_ID}")('next');`,
		'ternary-guard': `context.capture.read("${GUARD_SLOT_ID}") != null ? context.capture.read("${GUARD_SLOT_ID}")('x') : undefined;`,
		'typeof-guard': `typeof context.capture.read("${GUARD_SLOT_ID}") === 'function' && context.capture.read("${GUARD_SLOT_ID}")();`,
		// A slot that routes to a callback symbol lowers the whole call, guard and
		// all, to one invocation the runtime owns — so the optional chain has
		// nothing left to guard and correctly does not appear.
		'optional-call-bound': `return await context.capture.invoke("${GUARD_SLOT_ID}", ['next']);`,
	});
});

test('a guarded callback that the parent never passed does not call anything', async () => {
	for (const shape of GUARD_SHAPES) {
		if (shape.callbackRoute) continue;
		const paths = guardPaths(shape);

		// The capture reads `undefined`, which is what an omitted optional prop
		// resolves to. Every guard must swallow the call rather than throw.
		const fromSpliced = await runHandler(
			paths.spliced,
			'symbol_guard',
			recordingContext(() => undefined),
		);
		const fromPrinted = await runHandler(
			paths.printed,
			'symbol_guard',
			recordingContext(() => undefined),
		);

		expect(fromPrinted, `${shape.name}: absent-prop calls differ`).toEqual(fromSpliced);
		expect(fromPrinted.some((call) => call.startsWith('onChange ')), shape.name).toBe(false);
	}
});

test('a guarded callback the parent did pass is invoked, on both paths', async () => {
	for (const shape of GUARD_SHAPES) {
		const paths = guardPaths(shape);
		const passed = (calls: string[]) => (value: unknown) => {
			calls.push(`onChange ${JSON.stringify(value)}`);
			return 'handled';
		};

		const fromSpliced = await runHandler(
			paths.spliced,
			'symbol_guard',
			recordingContext(passed),
		);
		const fromPrinted = await runHandler(
			paths.printed,
			'symbol_guard',
			recordingContext(passed),
		);

		expect(fromPrinted, `${shape.name}: passed-prop calls differ`).toEqual(fromSpliced);
		// The bound shape hands the whole call to the runtime, so it records an
		// invocation rather than a direct call; every other shape calls through.
		expect(
			fromPrinted.some((call) =>
				shape.callbackRoute ? call.startsWith('capture.invoke ') : call.startsWith('onChange '),
			),
			`${shape.name}: the guard never let the call through`,
		).toBe(true);
	}
});

test('guarded callback emission is deterministic and carries a source map', () => {
	for (const shape of GUARD_SHAPES) {
		const emission = buildEventHandlerEmission({
			symbol: guardSymbol(shape),
			localNames: new Set<string>(),
			captureSlots: [guardSlot(shape)],
			usesArgumentVector: false,
			sourceFileName: '/workspace/app/src/Guarded.tsrx',
		});
		expect(emission, `${shape.name}: no emission`).not.toBeNull();

		const emitted = assertDeterministicEmission(emission!);

		expect(emitted.map.sources ?? []).toEqual(['/workspace/app/src/Guarded.tsrx']);
		expect(emitted.map.mappings.length, `${shape.name}: empty mappings`).toBeGreaterThan(0);
		expect(emitted.code).toBe(guardPaths(shape).printed);
	}
});
