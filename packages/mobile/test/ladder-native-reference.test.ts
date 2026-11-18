import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '@markless/router';
import type {
	NativeAppPayload,
	NativeJournalEntry,
	NativeValue,
	NativeViewPayload,
} from '@markless/serializer';
import {
	compileNativeComponent,
	createNativeAppRuntime,
	createNativeRuntime,
	type NativeRuntime,
} from '../src/index.ts';
import { compileRungApp, readRelativeModule } from '../src/harness/rung.ts';
import {
	navRungFolders,
	proofsDir,
	readRung,
	rungFolders,
	type LadderStep,
} from '../proofs/ladder.ts';

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';

// A mirror host: it keeps what a device shows and changes it only through journal entries, as the hosts must.
function mirror(
	payload: NativeViewPayload,
	opened: NativeRuntime,
	store: Map<string, NativeValue> = new Map(),
) {
	let runtime = opened;
	const texts = new Map<string, string>();
	const attributes = new Map<string, string | null>();
	const properties = new Map<string, string>();
	const chosen = new Map<string, number | null>();
	let title: string | null = null;
	const mount = (next: NativeRuntime) => {
		runtime = next;
		texts.clear();
		attributes.clear();
		chosen.clear();
		properties.clear();
		for (const [node, text] of runtime.texts()) texts.set(node, text);
		for (const [node, name, value] of runtime.attributes())
			attributes.set(`${node}\0${name}`, value);
		for (const [node, index] of runtime.arms()) chosen.set(node, index);
		for (const [node, , value] of runtime.properties()) properties.set(node, value);
		title = runtime.title();
	};
	mount(opened);
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
	const baseOf = (id: string) => (id.includes('@') ? id.slice(0, id.indexOf('@')) : id);
	const shownNode = (id: string): boolean => {
		const place = nodeOf.get(id)?.arm;
		return !place || (shownNode(place.branch) && chosen.get(place.branch) === place.index);
	};
	const inArm = (id: string, branch: string): boolean => {
		const node = nodeOf.get(id);
		if (!node?.arm) return false;
		return node.arm.branch === branch || inArm(node.arm.branch, branch);
	};
	// What a flow can see or tap: shown text, and each shown element's accessible name (aria-label, bound or static).
	const labels = () =>
		payload.nodes.flatMap((node) => {
			if (node.kind !== 'element') return [];
			const bound = attributes.get(`${node.id}\0aria-label`);
			const label = bound !== undefined ? bound : (node.attributes?.['aria-label'] ?? null);
			return label !== null && shownNode(node.id) ? [[node.id, label] as const] : [];
		});
	// The element a text names: a labelled element, or the element holding that text (a row instance keeps its key).
	const elementReading = (text: string) => {
		const labelled = labels().find(([, label]) => label === text)?.[0];
		if (labelled) return labelled;
		const node = [...texts].find(([, shown]) => shown === text)?.[0];
		if (!node) return undefined;
		const parent = nodeOf.get(baseOf(node))?.parent ?? undefined;
		return parent && node.includes('@') && nodeOf.get(parent)?.row
			? `${parent}${node.slice(node.indexOf('@'))}`
			: parent;
	};
	const apply = (entry: NativeJournalEntry, index: number) => {
		if (entry.op === 'text') texts.set(entry.node, entry.value);
		else if (entry.op === 'title') title = entry.value;
		else if (entry.op === 'attribute')
			attributes.set(`${entry.node}\0${entry.name}`, entry.value);
		else if (entry.op === 'property') properties.set(entry.node, entry.value);
		else if (entry.op === 'navigate') {
			// One page per rung: a navigation opens this page again with the link's params.
			expect(entry.route, `step ${index}: the link's route`).toBe(payload.route?.pattern);
			mount(createNativeRuntime(payload, store, entry.params));
		} else if (entry.op === 'rows') {
			const rowNodes = payload.nodes
				.filter((node) => node.row === entry.node)
				.map((node) => node.id);
			const kept = new Map<string, string>();
			for (const [id, text] of texts) {
				const at = id.indexOf('@');
				if (at < 0 || !rowNodes.includes(id.slice(0, at))) continue;
				texts.delete(id);
				if (entry.keys.includes(id.slice(at + 1))) kept.set(id, text);
			}
			const fresh = new Map(runtime.texts());
			for (const key of entry.keys)
				for (const node of rowNodes) {
					const id = `${node}@${key}`;
					const text = kept.get(id) ?? fresh.get(id);
					if (text !== undefined) texts.set(id, text);
				}
		} else if (entry.op === 'arm') {
			chosen.set(entry.node, entry.index);
			for (const id of texts.keys()) if (inArm(id, entry.node)) texts.delete(id);
			for (const key of attributes.keys())
				if (inArm(key.split('\0')[0]!, entry.node)) attributes.delete(key);
			for (const [id, text] of runtime.texts())
				if (inArm(id, entry.node)) texts.set(id, text);
			for (const [node, name, value] of runtime.attributes())
				if (inArm(node, entry.node)) attributes.set(`${node}\0${name}`, value);
		}
	};
	return {
		get runtime() {
			return runtime;
		},
		mount,
		apply,
		elementReading,
		disabled: (host: string) => attributes.get(`${host}\0disabled`) != null,
		typed: (host: string, text: string) => properties.set(host, text),
		check(step: LadderStep, index: number) {
			for (const [field, value] of Object.entries(step.fields ?? {})) {
				const host = elementReading(field);
				expect(host && properties.get(host), `step ${index}: the field "${field}"`).toBe(
					value,
				);
			}
			const shown = [...texts.values(), ...labels().map(([, label]) => label)];
			expect(shown, `step ${index}`).toEqual(expect.arrayContaining([...step.visible]));
			for (const text of step.absent ?? [])
				expect(shown, `step ${index}`).not.toContain(text);
			if (step.order)
				expect(shown.filter((text) => step.order!.includes(text))).toEqual(step.order);
			if (step.title !== undefined)
				expect(title, `step ${index}: the title`).toBe(step.title);
			for (const text of step.disabled ?? []) {
				const host = elementReading(text);
				expect(
					host && attributes.get(`${host}\0disabled`),
					`step ${index}: "${text}" is disabled`,
				).not.toBeNull();
			}
			expect(
				new Map(runtime.texts()),
				`step ${index}: the journal left a text stale`,
			).toEqual(texts);
			expect(
				new Map(
					runtime.attributes().map(([node, name, value]) => [`${node}\0${name}`, value]),
				),
				`step ${index}: the journal left an attribute stale`,
			).toEqual(attributes);
			expect(
				new Map(runtime.properties().map(([node, , value]) => [node, value])),
				`step ${index}: the journal left a field stale`,
			).toEqual(properties);
			expect(runtime.title(), `step ${index}: the journal left the title stale`).toBe(title);
		},
	};
}

type Mirror = ReturnType<typeof mirror>;

/** Runs a tap or a typed text on a mirrored screen, returning the journal it applied. */
function act(screen: Mirror, step: LadderStep, index: number): NativeJournalEntry[] {
	const action = step.do!;
	if (!('tap' in action) && !('type' in action))
		throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
	const name = 'tap' in action ? action.tap : action.type.field;
	const host = screen.elementReading(name);
	if (!host)
		throw new Error(
			`step ${index}: nothing reads "${name}" to ${'tap' in action ? 'tap' : 'type into'}`,
		);
	if (screen.disabled(host)) throw new Error(`step ${index}: "${name}" is disabled`);
	// Typing shows the text in the field at once; the input event then runs the handler.
	if ('type' in action) screen.typed(host, action.type.text);
	return [
		...('tap' in action
			? screen.runtime.dispatch({ event: 'activate', host })
			: screen.runtime.dispatch({ event: 'input', host, value: action.type.text })),
	];
}

function walk(
	payload: NativeViewPayload,
	steps: readonly LadderStep[],
	params: Readonly<Record<string, string>>,
) {
	const store = new Map<string, NativeValue>();
	const screen = mirror(payload, createNativeRuntime(payload, store, params), store);
	for (const [index, step] of steps.entries()) {
		if (step.do && 'relaunch' in step.do)
			screen.mount(createNativeRuntime(payload, store, params));
		else if (step.do) for (const entry of act(screen, step, index)) screen.apply(entry, index);
		screen.check(step, index);
	}
}

/**
 * The navigation column: a stack of mirrored screens. A `navigate` entry pushes (or replaces the top with) a new
 * screen built from the app runtime's own; Back pops and the screen below must still show what it was left with.
 */
function walkApp(app: NativeAppPayload, steps: readonly LadderStep[], start: string) {
	const appRuntime = createNativeAppRuntime(app, start);
	const pageOf = (route: string) => app.routes.find((entry) => entry.pattern === route)!.page;
	const stack = appRuntime
		.screens()
		.map((screen) => mirror(pageOf(screen.route), screen.runtime));
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'back' in action) {
			expect(
				appRuntime.dispatch({ event: 'back' }),
				`step ${index}: Back journals nothing`,
			).toEqual([]);
			stack.pop();
		} else if (action) {
			const top = stack.at(-1)!;
			const host = top.elementReading(
				'tap' in action ? action.tap : 'type' in action ? action.type.field : '',
			);
			if (!host) throw new Error(`step ${index}: nothing on the top screen to act on`);
			const journal =
				'tap' in action
					? appRuntime.dispatch({ event: 'activate', host })
					: 'type' in action
						? (top.typed(host, action.type.text),
							appRuntime.dispatch({ event: 'input', host, value: action.type.text }))
						: [];
			for (const entry of journal) {
				if (entry.op !== 'navigate') {
					top.apply(entry, index);
					continue;
				}
				const opened = appRuntime.screens().at(-1)!;
				expect(opened.route, `step ${index}: the screen opened`).toBe(entry.route);
				if (entry.replace) stack.pop();
				stack.push(mirror(pageOf(opened.route), opened.runtime));
			}
		}
		expect(stack.length, `step ${index}: the stack`).toBe(appRuntime.screens().length);
		stack.at(-1)!.check(step, index);
	}
}

test.each(rungFolders())(
	'%s: the native payload shows the web steps, or is refused by name',
	async (folder) => {
		const filename = join(proofsDir, folder, 'App.tsrx');
		const rung = readRung(folder);
		const page = rung.route === undefined ? undefined : `pages/${rung.route}.tsrx`;
		const build = await compileNativeComponent({
			filename,
			source: readFileSync(filename, 'utf8'),
			...(page ? { page } : {}),
			readModule: readRelativeModule,
		});
		if (build.payload === null) {
			expect(build.diagnostics.length).toBeGreaterThan(0);
			expect(build.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
				build.diagnostics.map(() => NATIVE_UNSUPPORTED),
			);
			return;
		}
		const opened = page
			? matchRouteManifest(rung.start ?? '/', buildRouteManifestFromFileIds([page]))
			: undefined;
		if (page && !opened) throw new Error(`${folder}: ${rung.start} is not a path of ${page}`);
		walk(build.payload, rung.steps, opened?.params ?? {});
	},
);

test.each(navRungFolders())(
	'%s: the app payload walks the steps as a stack of screens',
	async (folder) => {
		const rung = readRung(folder);
		const build = await compileRungApp(join(proofsDir, folder));
		expect(
			build.diagnostics.map((diagnostic) => `${diagnostic.page}: ${diagnostic.message}`),
		).toEqual([]);
		walkApp(build.payload!, rung.steps, rung.start ?? '/');
	},
);
