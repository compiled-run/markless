// The reference runtime's pointer events against what Safari on iOS and Chrome on Android delivered for the same touches
// on conformance/recorded/recorder.html (a Maestro flow on the simulator, `adb shell input` on the emulator).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { compileNativeComponent, createNativeRuntime, type NativeAction } from '../src/index.ts';
import { readCaseModule } from './conformance-cases.ts';

type Row = {
	readonly type: string;
	readonly name?: string;
	readonly target?: string;
	readonly relatedTarget?: string | null;
	readonly pointerId?: number;
	readonly clientX?: number;
	readonly clientY?: number;
	readonly t?: number;
};

const POINTER = new Set(['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']);
const TOUCH = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointercancel']);
// The fixture's node for each element of the recorder page (its html is <main>, its body <section>).
const NODES: Readonly<Record<string, string>> = {
	html: 'h0',
	body: 'h2',
	tap: 'h3',
	other: 'h4',
	drag: 'h5',
	release: 'h6',
	parent: 'h7',
	child: 'h8',
	scroll: 'h9',
	scrollInner: 'h10',
};
const NAMES = new Map(Object.entries(NODES).map(([name, node]) => [node, name]));

function steps(file: string): Map<string, Row[]> {
	const rows = readFileSync(join(import.meta.dirname, '..', 'conformance', 'recorded', file), 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as Row);
	const out = new Map<string, Row[]>();
	let step: Row[] = [];
	for (const row of rows)
		if (row.type === 'step') out.set(row.name!, (step = []));
		else step.push(row);
	return out;
}

/** The pointer events a step's touch raised on the page's elements, as `<type>:<element>><relatedTarget>`. */
const recorded = (rows: ReadonlyArray<Row>, related: boolean) =>
	rows
		.filter((row) => POINTER.has(row.type) && row.target! in NODES)
		.map((row) => `${row.type}:${row.target}>${related ? (row.relatedTarget ?? 'null') : 'null'}`);

/** The same touch as a host reports it: each down, move, up and cancel on the element the browser hit. */
const touches = (rows: ReadonlyArray<Row>): NativeAction[] =>
	rows
		.filter((row) => TOUCH.has(row.type) && row.target! in NODES)
		.map((row) => ({
			event: row.type as 'pointerdown',
			host: NODES[row.target!]!,
			pointerId: row.pointerId!,
			x: row.clientX!,
			y: row.clientY!,
			time: row.t!,
		}));

async function replay(actions: ReadonlyArray<NativeAction>, related: boolean): Promise<string[]> {
	const source = readFileSync(join(import.meta.dirname, 'fixtures', 'Recorder.tsrx'), 'utf8');
	const { payload } = await compileNativeComponent({ filename: 'src/recorder.tsrx', source, readModule: readCaseModule });
	const runtime = createNativeRuntime(payload!);
	for (const action of actions) runtime.dispatch(action);
	const log = runtime.texts().find(([node]) => node === 'h1:text0')![1];
	return log
		.trim()
		.split(' ')
		.map((entry) => {
			const [event, other] = entry.split('>');
			return `${event}>${related && other !== 'null' ? NAMES.get(other!) : 'null'}`;
		});
}

const SAME = ['tap', 'tap-other', 'tap-blank', 'drag-capture', 'release-drag'];

describe.each([
	// Safari reports no relatedTarget on a touch's boundary events.
	{ file: 'ios-safari.jsonl', related: false },
	{ file: 'android-chrome.jsonl', related: true },
])('$file', ({ file, related }) => {
	const recording = steps(file);
	test.each(SAME)('%s: the runtime raises what the browser raised, in its order', async (step) => {
		const rows = recording.get(step)!;
		expect(await replay(touches(rows), related)).toEqual(recorded(rows, related));
	});

	test('scroll: a touch a scroll takes is cancelled, then leaves', async () => {
		const rows = recording.get('scroll')!;
		const browser = recorded(rows, related);
		// Safari leaves only the touched element after a cancel; the runtime leaves each element it is in, as Chrome does.
		expect(await replay(touches(rows), related)).toEqual(
			related
				? browser
				: [...browser, 'pointerleave:scroll>null', 'pointerleave:body>null', 'pointerleave:html>null'],
		);
	});

	test('capture-parent: the parent that captures a touch on its child takes it before the next event', async () => {
		const rows = recording.get('capture-parent')!;
		const raised = await replay(touches(rows), related);
		const browser = recorded(rows, related);
		if (related) {
			expect(raised).toEqual(browser);
			return;
		}
		// Safari sends the first move to the child, and only then the boundary events; the runtime does as Chrome does.
		const firstMove = browser.indexOf('pointermove:child>null');
		const late = browser.slice(firstMove + 1, firstMove + 4);
		expect(late).toEqual(['pointerout:child>null', 'pointerleave:child>null', 'pointerover:parent>null']);
		expect(raised).toEqual([
			...browser.slice(0, firstMove),
			...late,
			'pointermove:parent>null',
			...browser.slice(firstMove + 4),
		]);
	});
});
