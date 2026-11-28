import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	compileTsrxModule,
	globalEventAttribute,
	normalizeEventName,
} from '../src/index.ts';

const app = (body: string) => `import { state } from '@markless/core';
export function App() @{
	let open = state(true);
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	${body}
}`;

const diagnostics = async (body: string) =>
	(await buildSemanticGraph({ filename: 'src/Global.tsrx', source: app(body) })).diagnostics;

test('onDocument* and onWindow* name the target and the DOM type the record listens for', () => {
	expect(normalizeEventName('onDocumentKeyDown')).toBe('document.keydown');
	expect(normalizeEventName('onDocumentVisibilityChange')).toBe('document.visibilitychange');
	expect(normalizeEventName('onWindowResize')).toBe('window.resize');
	expect(normalizeEventName('onWindowOnline')).toBe('window.online');
	expect(normalizeEventName('onKeyDown')).toBe('keydown');
	expect(globalEventAttribute('onDocumentPointerDown')).toEqual({
		target: 'document',
		type: 'pointerdown',
		prefix: 'onDocument',
	});
	expect(globalEventAttribute('onClick')).toBeUndefined();
	// A lower-case letter after the prefix is not the prefix: `ondocumentary` is one word.
	expect(globalEventAttribute('onDocumentary')).toBeUndefined();
	expect(globalEventAttribute('onWindowsKey')).toBeUndefined();
});

test('a document or window prop is recorded like an element event, on the element that owns it', async () => {
	const result = await compileTsrxModule({
		filename: 'src/GlobalRecords.tsrx',
		source: app(`<dialog
		open={open}
		onKeyDown={() => (open = true)}
		onDocumentKeyDown={(event) => {
			if (event.key === 'Escape') open = false;
		}}
		onWindowResize={() => (open = false)}
	>hi</dialog>`),
		symbols: [],
	});
	const events = result.protocolView.events.map((record) => record.eventName);
	expect(events).toEqual(['keydown', 'document.keydown', 'window.resize']);
	const hosts = new Set(result.protocolView.events.map((record) => record.hostNodeId));
	expect(hosts.size).toBe(1);
	expect(result.captureAnalysis.extractedSymbols.filter((symbol) => symbol.kind === 'event-handler')).toHaveLength(3);
});

test('a document keydown handler that cancels Escape carries its sync policy', async () => {
	const result = await compileTsrxModule({
		filename: 'src/GlobalPolicy.tsrx',
		source: app(`<section
		onDocumentKeyDown={(event) => {
			if (open && event.key === 'Escape') {
				event.preventDefault();
				open = false;
			}
		}}
	>x</section>`),
		symbols: [],
	});
	const record = result.protocolView.events.find((event) => event.eventName === 'document.keydown');
	expect(record?.syncPolicy).toBeDefined();
	expect(JSON.stringify(record?.syncPolicy)).toContain('"Escape"');
});

test('an event that never reaches the document or window fails the build with a named diagnostic', async () => {
	const found = await diagnostics(`<div>
		<p onDocumentFocus={() => (open = false)}>a</p>
		<p onDocumentMouseEnter={() => (open = false)}>b</p>
		<p onWindowSelectionChange={() => (open = false)}>c</p>
		<p onDocumentResize={() => (open = false)}>d</p>
		<p onDocumentFrobnicate={() => (open = false)}>e</p>
		<p onDocumentFocusIn={() => (open = false)} onWindowFocus={() => (open = false)}>ok</p>
	</div>`);
	const unknown = found.filter((diagnostic) => diagnostic.code === 'MARKLESS_GLOBAL_EVENT_UNKNOWN');
	expect(unknown.map((diagnostic) => diagnostic.title)).toEqual([
		'"focus" does not reach the document; use onDocumentFocusIn',
		'"mouseenter" does not reach the document; use onDocumentMouseOver',
		'"selectionchange" does not reach the window; use onDocumentSelectionChange',
		'"resize" does not reach the document; use onWindowResize',
		'onDocumentFrobnicate names no event the document receives',
	]);
	expect(unknown.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
	expect(unknown[0]).toEqual(
		expect.objectContaining({
			docsUrl: 'https://markless.dev/errors/MARKLESS_GLOBAL_EVENT_UNKNOWN',
			primarySpan: expect.objectContaining({ filename: 'src/Global.tsrx' }),
		}),
	);
	expect(found.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(5);
});

test('a document or window prop inside an @for row warns once per prop, and builds', async () => {
	const found = await diagnostics(`<ul>
		@for (const row of rows; key row.id) {
			<li onDocumentKeyDown={() => (open = false)} onClick={() => (open = true)}>{row.id}</li>
		}
	</ul>`);
	expect(found.map((diagnostic) => [diagnostic.code, diagnostic.severity])).toEqual([
		['MARKLESS_GLOBAL_EVENT_IN_ROW', 'warning'],
	]);
	const outside = await diagnostics(
		`<ul onDocumentKeyDown={() => (open = false)}>@for (const row of rows; key row.id) {<li>{row.id}</li>}</ul>`,
	);
	expect(outside).toEqual([]);
});

test('preventDefault in a passive document or window event fails the build', async () => {
	const found = await diagnostics(`<div
		onWindowWheel={(event) => {
			event.preventDefault();
		}}
		onDocumentTouchMove={(event) => {
			if (open) event.stopPropagation();
		}}
		onDocumentKeyDown={(event) => {
			event.preventDefault();
		}}
	>x</div>`);
	expect(found.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_GLOBAL_EVENT_PASSIVE_PREVENT',
	]);
});

test('a document or window handler loads on first use exactly what the same handler on the element would', async () => {
	const compile = async (prop: string) =>
		await compileTsrxModule({
			filename: 'src/Shortcut.tsrx',
			source: `import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<section ${prop}={() => count++}>{count}</section>
}`,
			symbols: [],
		});
	const firstUse = (result: Awaited<ReturnType<typeof compile>>) =>
		Object.fromEntries(
			Object.entries(result.runtimeDemandMaps).map(([tier, map]) => [
				tier,
				map.actions.map((action) => [action.recordKind, action.recordKinds, action.runtimeModuleIds, action.plan?.kind]),
			]),
		);
	const onDocument = await compile('onDocumentKeyDown');
	expect(onDocument.protocolView.events.map((event) => event.eventName)).toEqual(['document.keydown']);
	expect(firstUse(onDocument)).toEqual(firstUse(await compile('onKeyDown')));
	// The direct client renderer listens on the owning element, where the relay raises its event.
	expect(onDocument.publicRenderModule.moduleSource).not.toBe('');
	expect(onDocument.publicRenderModule.moduleSource).toContain('"document.keydown"');
});
