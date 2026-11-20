import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { NATIVE_REFUSALS } from '@markless/compiler/native';
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
	type NativeAction,
	nativeShownTexts,
	type NativeRuntime,
	type NativeScreen,
} from '../src/index.ts';
import { compileRungApp, readAppConfig, readWorkspaceModule } from '../src/harness/rung.ts';
import { echoText } from '../src/harness/echo-server.ts';
import { nativeMaxLength } from '@markless/serializer/native-view';
import { nodeScriptHost } from '../src/node-engine.ts';
import {
	looksOnly,
	navRungFolders,
	sheetStyleRungFolders,
	styleRungFolders,
	proofsDir,
	readRung,
	rungFolders,
	type LadderRung,
	type LadderStep,
} from '../proofs/ladder.ts';

/** What typing `text` into an emptied field leaves, as a phone's field limits it: `maxlength` UTF-16 code units, never half a surrogate pair. */
const typedInto = (text: string, maxlength: string | null) => {
	const max = nativeMaxLength(maxlength);
	if (max === undefined || text.length <= max) return text;
	return text.slice(0, /[\uD800-\uDBFF]/.test(text[max - 1] ?? '') ? max - 1 : max);
};

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';
const NATIVE_KEYBOARD_ONLY = 'MARKLESS_NATIVE_KEYBOARD_ONLY';
// The one-screen rungs a native build refuses today; every other rung must lower, so a rung cannot stop lowering unseen.
const REFUSED_RUNGS = new Set(['y4-sheet-beside-drawer', 'j7-page-refused']);

/**
 * The script services as a phone's host provides them, on a clock that moves only when a step waits: a timer fires once
 * its time comes, a request is answered at once with what the test's echo server would say.
 */
function scriptServices() {
	let now = 0;
	const timers = new Map<string, number>();
	const host = nodeScriptHost('00'.repeat(32));
	const answer = (entry: NativeJournalEntry): NativeAction | undefined => {
		if (entry.op === 'timer') timers.set(entry.timer, now + entry.ms);
		else if (entry.op === 'clearTimer') timers.delete(entry.timer);
		else if (entry.op === 'fetch') {
			const url = new URL(entry.request.url);
			const contentType =
				entry.request.headers.find(
					([name]) => name.toLowerCase() === 'content-type',
				)?.[1] ?? null;
			return {
				event: 'response',
				id: entry.id,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: echoText({
						method: entry.request.method,
						url: url.pathname + url.search,
						contentType,
						body: entry.request.body ?? '',
					}),
				},
			};
		}
		return undefined;
	};
	/** The timers due by `ms` from now, earliest first; each is fired as its time comes. */
	const advance = (ms: number, fire: (action: NativeAction) => void) => {
		const end = now + ms;
		for (;;) {
			const due = [...timers]
				.filter(([, at]) => at <= end)
				.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
			if (!due) break;
			now = due[1];
			timers.delete(due[0]);
			fire({ event: 'timer', timer: due[0] });
		}
		now = end;
	};
	return { host, answer, advance };
}

// A mirror host: it keeps what a device shows and changes it only through journal entries, as the hosts must.
function mirror(
	payload: NativeViewPayload,
	opened: NativeRuntime,
	store: Map<string, NativeValue> = new Map(),
	styled = false,
) {
	let runtime = opened;
	const texts = new Map<string, string>();
	const attributes = new Map<string, string | null>();
	const properties = new Map<string, string>();
	const chosen = new Map<string, number | null>();
	let title: string | null = null;
	// What the platform's sheets show: changed only by `sheet` entries.
	const sheetOpen = new Map<string, boolean>();
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
		sheetOpen.clear();
		for (const [node, open] of runtime.sheets()) sheetOpen.set(node, open);
	};
	mount(opened);
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
	const baseOf = (id: string) => (id.includes('@') ? id.slice(0, id.indexOf('@')) : id);
	const inClosedSheet = (id: string): boolean => {
		const parent = nodeOf.get(baseOf(id))?.parent;
		if (!parent) return false;
		return (
			(nodeOf.get(parent)?.kind === 'sheet' && !sheetOpen.get(parent)) ||
			inClosedSheet(parent)
		);
	};
	// In a list row the arms around a node are that row's copies (`<branch>@<key>`).
	const shownNode = (id: string): boolean => {
		if (inClosedSheet(id)) return false;
		const at = id.indexOf('@');
		const place = nodeOf.get(at < 0 ? id : id.slice(0, at))?.arm;
		if (!place) return true;
		const branch = nodeOf.get(place.branch)?.row
			? `${place.branch}${id.slice(at)}`
			: place.branch;
		return shownNode(branch) && chosen.get(branch) === place.index;
	};
	// A row's copy (`<id>@<key>`) sits where its list does.
	const inArm = (id: string, branch: string): boolean => {
		const at = id.indexOf('@');
		const node = nodeOf.get(at < 0 ? id : id.slice(0, at));
		if (node?.arm) {
			const own = nodeOf.get(node.arm.branch)?.row
				? `${node.arm.branch}${id.slice(at)}`
				: node.arm.branch;
			return own === branch || inArm(own, branch);
		}
		return node?.row ? inArm(node.row, branch) : false;
	};
	// An element carrying `hidden`, bound or static, hides everything inside it, as the web's `[hidden]` rule does.
	const hiddenWithin = (id: string): boolean => {
		const at = id.indexOf('@');
		const suffix = at < 0 ? '' : id.slice(at);
		const node = nodeOf.get(baseOf(id));
		if (!node) return false;
		if (node.kind === 'element') {
			const bound = attributes.get(`${id}\0hidden`);
			if ((bound !== undefined ? bound : (node.attributes?.['hidden'] ?? null)) !== null)
				return true;
		}
		return (
			node.parent !== null &&
			hiddenWithin(`${node.parent}${nodeOf.get(node.parent)?.row ? suffix : ''}`)
		);
	};
	// What a flow can see or tap: shown text, and each shown element's accessible name (aria-label, bound or static).
	const labels = () =>
		payload.nodes.flatMap((node) => {
			if (node.kind !== 'element') return [];
			const bound = attributes.get(`${node.id}\0aria-label`);
			const label =
				bound !== undefined ? bound : (node.attributes?.['aria-label'] ?? node.drawing?.label ?? null);
			return label !== null && shownNode(node.id) ? [[node.id, label] as const] : [];
		});
	// The element a text names: a labelled element, or the element holding that text (a row instance keeps its key).
	const elementReading = (text: string) => {
		const labelled = labels().find(([, label]) => label === text)?.[0];
		if (labelled) return labelled;
		const node = [...texts].find(([id, shown]) => shown === text && !inClosedSheet(id))?.[0];
		if (!node) return undefined;
		const parent = nodeOf.get(baseOf(node))?.parent ?? undefined;
		return parent && node.includes('@') && nodeOf.get(parent)?.row
			? `${parent}${node.slice(node.indexOf('@'))}`
			: parent;
	};
	const apply = (entry: NativeJournalEntry, index: number) => {
		if (entry.op === 'text') texts.set(entry.node, entry.value);
		else if (entry.op === 'sheet') sheetOpen.set(entry.node, entry.open);
		else if (entry.op === 'title') title = entry.value;
		else if (entry.op === 'attribute')
			attributes.set(`${entry.node}\0${entry.name}`, entry.value);
		else if (entry.op === 'property') properties.set(entry.node, entry.value);
		else if (entry.op === 'navigate') {
			// One page per rung: a navigation opens this page again with the link's params.
			expect(entry.route, `step ${index}: the link's route`).toBe(payload.route?.pattern);
			mount(createNativeRuntime(payload, store, entry.params));
		} else if (entry.op === 'rows') {
			for (const [node, index] of runtime.arms())
				if (!chosen.has(node)) chosen.set(node, index);
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
			for (const [node, index] of runtime.arms())
				if (inArm(node, entry.node)) chosen.set(node, index);
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
		/** Types into the emptied field and returns what it holds. */
		typed: (host: string, text: string) => {
			const bound = attributes.get(`${host}\0maxlength`);
			const node = nodeOf.get(host);
			const limit =
				bound !== undefined
					? bound
					: node?.kind === 'element'
						? (node.attributes?.['maxlength'] ?? null)
						: null;
			const held = typedInto(text, limit);
			properties.set(host, held);
			return held;
		},
		check(step: LadderStep, index: number) {
			for (const [field, value] of Object.entries(step.fields ?? {})) {
				const host = elementReading(field);
				expect(host && properties.get(host), `step ${index}: the field "${field}"`).toBe(
					value,
				);
			}
			// Without a style export a host flows text as the browser's default stylesheet does; with one, Dragon lays it out.
			const open = new Map(
				[...texts].filter(([id]) => !inClosedSheet(id) && !hiddenWithin(id)),
			);
			const read = styled ? [...open.values()] : nativeShownTexts(payload, open);
			const shown = [...read, ...labels().map(([, label]) => label)];
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

/**
 * The navigation column: a stack of mirrored screens. A `navigate` entry pushes (or replaces the top with) a new
 * screen built from the app runtime's own; Back pops and the screen below must still show what it was left with.
 */
function walkApp(
	app: NativeAppPayload,
	steps: readonly LadderStep[],
	start: string,
	styled: ReadonlySet<string> = new Set(),
	position?: LadderRung['location'],
) {
	const services = scriptServices();
	const appRuntime = createNativeAppRuntime(app, start, new Map(), services.host);
	const pageOf = (route: string) => app.routes.find((entry) => entry.pattern === route)!.page;
	// A screen's device, as a host's when the flow granted every permission: its values when it opens, then its asks answered.
	const wake = (screen: NativeScreen, shown: ReturnType<typeof mirror>) => {
		const runtime = screen.runtime;
		for (const cell of pageOf(screen.route).cells) {
			if (!cell.device) continue;
			if (cell.device !== 'location.access')
				throw new Error(`no fake ${cell.device} in an app`);
			for (const entry of runtime.dispatch({ event: 'device', cell: cell.id, value: 'granted' }))
				shown.apply(entry, -1);
		}
		for (const task of runtime.tasks())
			for (const entry of runtime.dispatch({
				event: 'settle',
				cell: task.result!,
				value: { ...position!, accuracy: 5 },
			}))
				shown.apply(entry, -1);
	};
	const open = (screen: NativeScreen) => {
		const shown = mirror(pageOf(screen.route), screen.runtime, new Map(), styled.has(screen.route));
		wake(screen, shown);
		return shown;
	};
	const stack = appRuntime.screens().map(open);
	for (const entry of appRuntime.started) {
		const answer = services.answer(entry);
		if (answer) for (const next of appRuntime.dispatch(answer)) stack.at(-1)!.apply(next, -1);
	}
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'back' in action) {
			// Back journals what the leaving screen cancels, then what the screen it shows takes from the app's shared copies.
			const journal = appRuntime.dispatch({ event: 'back' });
			stack.pop();
			for (const entry of journal)
				if (entry.op !== 'abort' && entry.op !== 'clearTimer') stack.at(-1)!.apply(entry, index);
		} else if (looksOnly(action) || (action && ('swipe' in action || 'scrollTo' in action))) {
			// Neither the appearance nor a sheet's resting height or scroll changes state: the hosts restyle and lay out.
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
						? appRuntime.dispatch({
								event: 'input',
								host,
								value: top.typed(host, action.type.text),
							})
						: [];
			const answered: NativeAction[] = [];
			for (const entry of journal) {
				const answer = services.answer(entry);
				if (answer) answered.push(answer);
				if (entry.op !== 'navigate') {
					top.apply(entry, index);
					continue;
				}
				const opened = appRuntime.screens().at(-1)!;
				expect(opened.route, `step ${index}: the screen opened`).toBe(entry.route);
				if (entry.replace) stack.pop();
				stack.push(open(opened));
			}
			for (const next of answered)
				for (const entry of appRuntime.dispatch(next)) stack.at(-1)!.apply(entry, index);
		}
		expect(stack.length, `step ${index}: the stack`).toBe(appRuntime.screens().length);
		stack.at(-1)!.check(step, index);
		if (step.engineStarts !== undefined)
			expect(services.host.starts(), `step ${index}: the engine starts`).toBe(
				step.engineStarts,
			);
	}
}

// The one-screen column's host, with a fake device; it too changes what it shows only through journal entries.
function walk(
	payload: NativeViewPayload,
	steps: readonly LadderStep[],
	params: Readonly<Record<string, string>>,
	position: LadderRung['location'],
	target: 'ios' | 'android',
	styled = false,
	belowFold?: string,
) {
	const store = new Map<string, NativeValue>();
	let calls: string[] = [];
	// A fake device, as a host's: location permission, where it is, and the calls waiting on the person's answer.
	let permission: 'unknown' | 'granted' | 'denied' = 'unknown';
	let cameraPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
	let microphonePermission: 'unknown' | 'granted' | 'denied' = 'unknown';
	let waiting: string[] = [];
	// Recorders: those recording and their seconds, and those whose start waits on the microphone prompt.
	const recording = new Map<string, number>();
	let waitingForMicrophone: string[] = [];
	const askedAgain = new Set<string>();
	// A shown <audio> control is playing; the share sheet's open call waits for the sheet to close.
	let playing = false;
	let sheet: string | undefined;
	const objectCell = (object: string, name: string) =>
		payload.cells.find((cell) => cell.object === object && cell.device === name)!.id;
	const setObject = (object: string, name: string, value: NativeValue) =>
		runtime.dispatch({ event: 'device', cell: objectCell(object, name), value });
	// The emulator's camera faces back only; the simulator's test camera faces either way.
	const facings = target === 'android' ? ['back'] : ['back', 'front'];
	const deviceValue = (name: string): NativeValue => {
		if (name === 'location.access') return permission;
		if (name === 'camera.access') return cameraPermission;
		if (name === 'camera.ready') return cameraPermission === 'granted';
		if (name === 'camera.facing') return 'back';
		if (name === 'recorder.access') return microphonePermission;
		if (name === 'recorder.active') return false;
		if (name === 'recorder.seconds') return 0;
		if (name === 'recorder.clip') return null;
		if (name === 'network.online') return true;
		throw new Error(`no fake ${name}`);
	};
	const answer = (cell: string) =>
		permission === 'granted'
			? runtime.dispatch({ event: 'settle', cell, value: { ...position!, accuracy: 5 } })
			: runtime.dispatch({
					event: 'settle',
					cell,
					error: { name: 'NotAllowedError', message: 'Location was refused' },
				});
	const services = scriptServices();
	// The device's clock: a second passes between a person's actions.
	let clock = Date.now();
	const start = () => {
		const r = createNativeRuntime(payload, store, params, undefined, () => clock, services.host);
		for (const cell of payload.cells)
			if (cell.device)
				r.dispatch({ event: 'device', cell: cell.id, value: deviceValue(cell.device) });
		return r;
	};
	let runtime = start();
	const startTasks = () => {
		waiting = [];
		for (const task of runtime.tasks()) {
			calls.push(task.call);
			if (permission === 'unknown') waiting.push(task.result!);
			else apply(answer(task.result!), -1);
		}
		apply(runtime.start(), -1);
	};
	const texts = new Map(runtime.texts());
	const attributes = new Map(
		runtime.attributes().map(([node, name, value]) => [`${node}\0${name}`, value]),
	);
	const properties = new Map(runtime.properties().map(([node, , value]) => [node, value]));
	const mount = () => {
		texts.clear();
		attributes.clear();
		chosen.clear();
		for (const [node, text] of runtime.texts()) texts.set(node, text);
		for (const [node, name, value] of runtime.attributes())
			attributes.set(`${node}\0${name}`, value);
		for (const [node, index] of runtime.arms()) chosen.set(node, index);
		properties.clear();
		for (const [node, , value] of runtime.properties()) properties.set(node, value);
		sheetOpen.clear();
		for (const [node, open] of runtime.sheets()) sheetOpen.set(node, open);
		checks.clear();
		for (const [node, checked] of runtime.checks()) checks.set(node, checked);
		selected.clear();
		for (const [node, value] of runtime.selections()) selected.set(node, value);
	};
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
	// A closed <dialog> shows nothing (the UA's dialog:not([open]) rule); the journal opens and closes it.
	const openDialogs = new Map(runtime.dialogs());
	const chosen = new Map(runtime.arms());
	// What the platform's sheets show: changed only by `sheet` entries and by the platform closing one.
	const sheetOpen = new Map(runtime.sheets());
	const inClosedSheet = (id: string): boolean => {
		const parent = nodeOf.get(id)?.parent;
		if (!parent) return false;
		return (
			(nodeOf.get(parent)?.kind === 'sheet' && !sheetOpen.get(parent)) ||
			inClosedSheet(parent)
		);
	};
	// In a list row the arms around a node are that row's copies (`<branch>@<key>`).
	const shownNode = (id: string): boolean => {
		if (inClosedSheet(id)) return false;
		const at = id.indexOf('@');
		const place = nodeOf.get(at < 0 ? id : id.slice(0, at))?.arm;
		if (!place) return true;
		const branch = nodeOf.get(place.branch)?.row
			? `${place.branch}${id.slice(at)}`
			: place.branch;
		return shownNode(branch) && chosen.get(branch) === place.index;
	};
	const openSheet = (index: number): string => {
		const open = [...sheetOpen].filter(([, isOpen]) => isOpen).map(([node]) => node);
		if (open.length !== 1)
			throw new Error(`step ${index}: ${open.length} system sheets are open`);
		return open[0]!;
	};
	const shownTexts = () => [...texts].filter(([node]) => shownNode(node));
	// A row's copy (`<id>@<key>`) sits where its list does.
	const inArm = (id: string, branch: string): boolean => {
		const at = id.indexOf('@');
		const node = nodeOf.get(at < 0 ? id : id.slice(0, at));
		if (node?.arm) {
			const own = nodeOf.get(node.arm.branch)?.row
				? `${node.arm.branch}${id.slice(at)}`
				: node.arm.branch;
			return own === branch || inArm(own, branch);
		}
		return node?.row ? inArm(node.row, branch) : false;
	};
	// An element carrying `hidden`, bound or static, hides everything inside it, as the web's `[hidden]` rule does.
	const hiddenWithin = (id: string): boolean => {
		const at = id.indexOf('@');
		const suffix = at < 0 ? '' : id.slice(at);
		const node = nodeOf.get(at < 0 ? id : id.slice(0, at));
		if (!node) return false;
		if (node.kind === 'element') {
			if (openDialogs.get(id) === false) return true;
			// An option shows only in its select's list, which is closed between steps.
			if (node.element === 'option') return true;
			const bound = attributes.get(`${id}\0hidden`);
			if ((bound !== undefined ? bound : (node.attributes?.['hidden'] ?? null)) !== null)
				return true;
		}
		return (
			node.parent !== null &&
			hiddenWithin(`${node.parent}${nodeOf.get(node.parent)?.row ? suffix : ''}`)
		);
	};
	/** A shown copy's node and its row suffix (`@<key>`, empty outside rows). */
	const instanceOf = (id: string) => {
		const at = id.indexOf('@');
		return at < 0 ? { node: id, suffix: '' } : { node: id.slice(0, at), suffix: id.slice(at) };
	};
	/** The element a shown node sits in, as the copy in the same row. */
	const parentOf = (id: string): string | undefined => {
		const { node, suffix } = instanceOf(id);
		const parent = nodeOf.get(node)?.parent;
		if (parent == null) return undefined;
		return nodeOf.get(parent)?.row ? `${parent}${suffix}` : parent;
	};
	// What a flow can see or tap: shown text, and each shown element's accessible name (aria-label, bound or static).
	const labels = () =>
		payload.nodes.flatMap((node) => {
			if (node.kind !== 'element') return [];
			const ids = node.row
				? (new Map(runtime.rows()).get(node.row) ?? []).map((key) => `${node.id}@${key}`)
				: [node.id];
			return ids.flatMap((id) => labelOf(node, id));
		});
	const labelOf = (
		node: Extract<NativeViewPayload['nodes'][number], { kind: 'element' }>,
		id: string,
	): (readonly [string, string])[] => {
		const attribute = (name: string) => {
			const bound = attributes.get(`${id}\0${name}`);
			return bound !== undefined ? bound : (node.attributes?.[name] ?? null);
		};
		// A host shows an <audio controls> with a clip as one control named for what it does next.
		if (node.element === 'audio')
			return shownNode(node.id) && attributes.get(`${id}\0src`) != null
				? [[id, playing ? 'Pause' : 'Play'] as const]
				: [];
		// aria-labelledby names an element by the text of the elements it lists, as the hosts read it.
		const labelledBy = attribute('aria-labelledby');
		const label =
			attribute('aria-label') ??
			(node.element === 'img' ? (node.attributes?.alt ?? null) : null) ??
			// An svg's text reads as the svg's, as the browser exposes it.
			node.drawing?.label ??
			(labelledBy === null
				? null
				: labelledBy
						.split(' ')
						.map((target) =>
							[...texts]
								.filter(([text]) => parentOf(text) === target)
								.map(([, shown]) => shown)
								.join(' '),
						)
						.join(' '));
		return label !== null && shownNode(node.id) ? [[id, label] as const] : [];
	};
	const elementReading = (text: string) => {
		const labelled = labels().find(([, label]) => label === text)?.[0];
		if (labelled) return labelled;
		const node = shownTexts().find(([id, shown]) => shown === text && !hiddenWithin(id))?.[0];
		return node ? parentOf(node) : undefined;
	};
	// A field's text: what its `value` binding or attribute gave it, then what was typed or the journal wrote.
	const staticValue = (id: string) => {
		const node = nodeOf.get(id);
		return node?.kind === 'element' && node.element === 'input' && !properties.has(id)
			? (node.attributes?.['value'] ?? '')
			: undefined;
	};
	const typed = new Map<string, string>();
	const checks = new Map(runtime.checks());
	// Each option's selectedness as the journal reported it; an option a new row adds starts unselected.
	const selected = new Map(runtime.selections());
	// A closed select shows its chosen option's label; its options show only in its list.
	const chosenLabels = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'element' && node.element === 'select' && shownNode(node.id) && !hiddenWithin(node.id)
				? runtime.choices(node.id).flatMap((choice) => (selected.get(choice.option) ? [choice.label] : []))
				: [],
		);
	const attributeNow = (id: string, name: string) => {
		const bound = attributes.get(`${id}\0${name}`);
		if (bound !== undefined) return bound;
		const node = nodeOf.get(id);
		return node?.kind === 'element' ? (node.attributes?.[name] ?? null) : null;
	};
	const fieldText = (id: string) => typed.get(id) ?? properties.get(id) ?? staticValue(id);
	// Timers the journal set, on a clock that only `wait` moves; a host shows a blocked submit's message until the next action.
	let now = 0;
	let timers: { readonly timer: string; readonly due: number }[] = [];
	let invalid: string | undefined;
	function apply(dispatched: ReadonlyArray<NativeJournalEntry>, index: number, at = now) {
		const answered: Array<() => ReadonlyArray<NativeJournalEntry>> = [];
		for (const entry of dispatched) {
			if (entry.op === 'call') {
				calls.push(entry.call);
				if (entry.call === 'camera.takePhoto' && entry.resume) {
					const continuation = entry.resume;
					answered.push(() =>
						cameraPermission === 'granted'
							? runtime.dispatch({
									event: 'resume',
									continuation,
									value: {
										url: 'file:///proof/photo.png',
										width: 640,
										height: 480,
									},
								})
							: runtime.dispatch({
									event: 'reject',
									continuation,
									error: {
										name: 'NotAllowedError',
										message: 'The camera was refused',
									},
								}),
					);
				}
				if (entry.call === 'recorder.active') {
					const object = entry.object!;
					if (entry.arguments[0] === true) {
						if (
							microphonePermission === 'unknown' ||
							(target === 'android' &&
								microphonePermission === 'denied' &&
								!askedAgain.has(object))
						) {
							askedAgain.add(object);
							waitingForMicrophone.push(object);
						} else if (microphonePermission === 'granted') recording.set(object, 0);
						// A refused microphone snaps the setting back.
						else answered.push(() => setObject(object, 'recorder.active', false));
					} else if (recording.delete(object))
						answered.push(() =>
							setObject(object, 'recorder.clip', 'file:///proof/clip.m4a'),
						);
				}
				if (entry.call === 'sharesheet.open') sheet = entry.resume;
				if (
					entry.call === 'camera.facing' &&
					!facings.includes(String(entry.arguments[0]))
				) {
					// The device has no camera facing that way: the setting snaps back to the camera it uses.
					const cell = payload.cells.find(
						(candidate) =>
							candidate.device === 'camera.facing' &&
							candidate.object === entry.object,
					);
					if (cell)
						answered.push(() =>
							runtime.dispatch({ event: 'device', cell: cell.id, value: 'back' }),
						);
				}
			} else if (entry.op === 'release') {
				const object = entry.object;
				recording.delete(object);
				for (const [name, value] of [
					['recorder.active', false],
					['recorder.seconds', 0],
					['recorder.clip', null],
				] as const)
					if (
						payload.cells.some((cell) => cell.object === object && cell.device === name)
					)
						answered.push(() => setObject(object, name, value));
			} else if (entry.op === 'timer') timers.push({ timer: entry.timer, due: at + entry.ms });
			else if (entry.op === 'clearTimer') timers = timers.filter((timer) => timer.timer !== entry.timer);
			else if (entry.op === 'invalid') invalid = entry.message;
			else if (entry.op === 'text') texts.set(entry.node, entry.value);
			else if (entry.op === 'dialog') openDialogs.set(entry.node, entry.open);
			else if (entry.op === 'attribute')
				attributes.set(`${entry.node}\0${entry.name}`, entry.value);
			else if (entry.op === 'property' && entry.name === 'checked')
				checks.set(entry.node, entry.value);
			else if (entry.op === 'property' && entry.name === 'selected')
				selected.set(entry.node, entry.value);
			else if (entry.op === 'property') {
				properties.set(entry.node, entry.value);
				typed.delete(entry.node);
			}
			else if (entry.op === 'navigate') {
				// One page per rung: a navigation opens this page again with the link's params.
				expect(entry.route, `step ${index}: the link's route`).toBe(payload.route?.pattern);
				runtime = createNativeRuntime(payload, store, entry.params);
				mount();
			} else if (entry.op === 'rows') {
				for (const [node, index] of runtime.arms()) if (!chosen.has(node)) chosen.set(node, index);
				const rowNodes = payload.nodes.filter((node) => node.row === entry.node).map((node) => node.id);
				const kept = new Map<string, string>();
				for (const [id, text] of texts) {
					const instance = instanceOf(id);
					if (!instance.suffix || !rowNodes.includes(instance.node)) continue;
					texts.delete(id);
					if (entry.keys.includes(instance.suffix.slice(1))) kept.set(id, text);
				}
				const fresh = new Map(runtime.texts());
				for (const key of entry.keys)
					for (const node of rowNodes) {
						const id = `${node}@${key}`;
						const text = kept.get(id) ?? fresh.get(id);
						if (text !== undefined) texts.set(id, text);
					}
				// A row that stays keeps its attributes; a new row's are built from current values.
				const keptAttributes = new Map<string, string | null>();
				for (const [key, value] of attributes) {
					const instance = instanceOf(key.split('\0')[0]!);
					if (!instance.suffix || !rowNodes.includes(instance.node)) continue;
					attributes.delete(key);
					if (entry.keys.includes(instance.suffix.slice(1))) keptAttributes.set(key, value);
				}
				for (const [node, name, value] of runtime.attributes()) {
					const instance = instanceOf(node);
					if (!instance.suffix || !rowNodes.includes(instance.node)) continue;
					const key = `${node}\0${name}`;
					attributes.set(key, keptAttributes.has(key) ? keptAttributes.get(key)! : value);
				}
			} else if (entry.op === 'arm') {
				chosen.set(entry.node, entry.index);
				for (const [node, index] of runtime.arms())
					if (inArm(node, entry.node)) chosen.set(node, index);
				for (const id of texts.keys()) if (inArm(id, entry.node)) texts.delete(id);
				for (const key of attributes.keys())
					if (inArm(key.split('\0')[0]!, entry.node)) attributes.delete(key);
				for (const [id, text] of runtime.texts())
					if (inArm(id, entry.node)) texts.set(id, text);
				for (const [node, name, value] of runtime.attributes())
					if (inArm(node, entry.node)) attributes.set(`${node}\0${name}`, value);
			} else if (entry.op === 'sheet') sheetOpen.set(entry.node, entry.open);
			const scripted = services.answer(entry);
			if (scripted) answered.push(() => runtime.dispatch(scripted));
		}
		for (const next of answered) apply(next(), index);
	}
	function refreshAccess(index: number) {
		for (const cell of payload.cells)
			if (
				cell.device === 'location.access' ||
				cell.device === 'camera.access' ||
				cell.device === 'camera.ready' ||
				cell.device === 'recorder.access'
			)
				apply(
					runtime.dispatch({
						event: 'device',
						cell: cell.id,
						value: deviceValue(cell.device),
					}),
					index,
				);
	}
	startTasks();
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action) invalid = undefined;
		if (action && 'relaunch' in action) {
			if (action.permissions?.location === 'unset') permission = 'unknown';
			// Android remembers a refusal across a revoke: access stays denied, and the system still asks again.
			if (action.permissions?.microphone === 'unset')
				microphonePermission =
					target === 'android' && microphonePermission === 'denied'
						? 'denied'
						: 'unknown';
			recording.clear();
			askedAgain.clear();
			playing = false;
			// The test build's call label starts over with the app.
			calls = [];
			runtime = start();
			typed.clear();
			mount();
			startTasks();
		} else if (action && 'device' in action) {
			for (const [name, value] of Object.entries(action.device))
				for (const cell of payload.cells)
					if (cell.device === name)
						apply(runtime.dispatch({ event: 'device', cell: cell.id, value }), index);
		} else if (action && 'answer' in action) {
			const given = action.answer === 'allow' ? 'granted' : 'denied';
			if (payload.cells.some((cell) => cell.device?.startsWith('recorder.')))
				microphonePermission = given;
			else if (payload.cells.some((cell) => cell.device?.startsWith('camera.')))
				cameraPermission = given;
			else permission = given;
			refreshAccess(index);
			for (const cell of waiting.splice(0)) apply(answer(cell), index);
			for (const object of waitingForMicrophone.splice(0))
				if (given === 'granted') recording.set(object, 0);
				else apply(setObject(object, 'recorder.active', false), index);
		} else if (action && 'wait' in action) {
			for (const [object, seconds] of recording) {
				const elapsed = seconds + Math.floor(action.wait / 1000);
				recording.set(object, elapsed);
				apply(setObject(object, 'recorder.seconds', elapsed), index);
			}
			now += action.wait;
			for (
				let next = timers.sort((x, y) => x.due - y.due)[0];
				next && next.due <= now;
				next = timers.sort((x, y) => x.due - y.due)[0]
			) {
				timers = timers.filter((timer) => timer !== next);
				apply(runtime.dispatch({ event: 'timer', timer: next.timer }), index, next.due);
			}
		} else if (action && 'dismiss' in action) {
			if (sheet === undefined) throw new Error(`step ${index}: no share sheet is open`);
			const continuation = sheet;
			sheet = undefined;
			apply(runtime.dispatch({ event: 'resume', continuation, value: null }), index);
		} else if (action && 'settings' in action) {
			if (!calls.includes('settings.open'))
				throw new Error(`step ${index}: Settings was never opened`);
			// The person allows, in Settings, the feature the page asked for.
			if (payload.cells.some((cell) => cell.device === 'location.access'))
				permission = 'granted';
			refreshAccess(index);
		} else if (action && 'tap' in action && (action.tap === 'Play' || action.tap === 'Pause')) {
			if (!labels().some(([, label]) => label === action.tap))
				throw new Error(`step ${index}: no audio control reads "${action.tap}"`);
			playing = action.tap === 'Play';
		} else if (action && 'swipe' in action && action.swipe === 'up') openSheet(index);
		else if (action && 'swipe' in action) {
			// Scrolling changes what is on screen, not what the page holds; the devices and the web judge the screen.
		}
		else if (action && 'scrollTo' in action) {
			openSheet(index);
			if (!shownTexts().some(([, text]) => text === action.scrollTo))
				throw new Error(`step ${index}: "${action.scrollTo}" is not in the open sheet`);
		} else if (action && ('escape' in action || 'pressBackdrop' in action)) {
			const top = runtime.overlays().at(-1)?.[0];
			if (!top) throw new Error(`step ${index}: no overlay is open to ${Object.keys(action)[0]}`);
			apply(
				'escape' in action
					? runtime.dispatch({ event: 'dismiss', host: top, reason: 'escape' })
					: [
							...runtime.dispatch({ event: 'pointerdown', host: top }),
							...runtime.dispatch({ event: 'pointerup', host: top }),
						],
				index,
			);
		} else if (action && 'choose' in action) {
			const select = elementReading(action.choose.field);
			if (!select || nodeOf.get(select)?.kind !== 'element')
				throw new Error(`step ${index}: no select reads "${action.choose.field}"`);
			if (attributeNow(select, 'disabled') != null)
				throw new Error(`step ${index}: "${action.choose.field}" is disabled`);
			const choice = runtime.choices(select).find((one) => one.label === action.choose.option);
			if (!choice || choice.disabled)
				throw new Error(`step ${index}: "${action.choose.field}" has no option "${action.choose.option}" to pick`);
			apply(runtime.dispatch({ event: 'choose', host: choice.option }), index);
		} else if (action && 'drag' in action) {
			const host = elementReading(action.drag.on);
			if (!host) throw new Error(`step ${index}: nothing reads "${action.drag.on}" to drag`);
			// A finger's drag as a phone reports it: down, a move every 16 ms of 20 points, and up; the platform takes a drag along
			// a box that scrolls after a few moves, as both phones' browsers do.
			const step = action.drag.direction === 'right' ? { x: 20, y: 0 } : { x: 0, y: -20 };
			const touch = (event: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', n: number) =>
				runtime.dispatch({ event, host, pointerId: 1, x: 100 + step.x * n, y: 300 + step.y * n, time: 16 * n });
			const out = [...touch('pointerdown', 0)];
			const moves = action.drag.scrolls ? 3 : 10;
			for (let n = 1; n <= moves; n++) out.push(...touch('pointermove', n));
			out.push(...touch(action.drag.scrolls ? 'pointercancel' : 'pointerup', moves));
			apply(out, index);
		} else if (action && !('tap' in action) && !('type' in action) && !('submit' in action) && !('dismissSheet' in action))
			throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
		else if (action && 'dismissSheet' in action) {
			const sheet = openSheet(index);
			const node = nodeOf.get(sheet);
			if (node?.kind !== 'sheet' || !node.dismissible)
				throw new Error(`step ${index}: ${sheet} cannot be dismissed`);
			sheetOpen.set(sheet, false);
			apply(runtime.dispatch({ event: 'dismiss', host: sheet }), index);
		} else if (action) {
			const name =
				'tap' in action ? action.tap : 'type' in action ? action.type.field : action.submit;
			const host = elementReading(name);
			if (!host)
				throw new Error(
					`step ${index}: nothing reads "${name}" to ${'tap' in action ? 'tap' : 'type into'}`,
				);
			if (attributeNow(host, 'disabled') != null)
				throw new Error(`step ${index}: "${name}" is disabled`);
			// Typing shows the text in the field at once; the input event then runs the handler.
			const text =
				'type' in action
					? typedInto(action.type.text, attributeNow(host, 'maxlength'))
					: undefined;
			if (text !== undefined) {
				if (properties.has(host)) properties.set(host, text);
				else typed.set(host, text);
			}
			// A tap is a touch going down and up on what it lands on, then the activation of the nearest element around it
			// that handles a press, as on a phone; it lands inside the screen, never at its corner.
			const touched =
				'tap' in action
					? [
							...runtime.dispatch({ event: 'pointerdown', host, x: 1, y: 1 }),
							...runtime.dispatch({ event: 'pointerup', host, x: 1, y: 1 }),
						]
					: [];
			apply(touched, index);
			let pressed: string | null | undefined = host;
			while (
				pressed &&
				!payload.events.some(
					(event) => event.host === pressed && event.event === 'activate',
				)
			)
				pressed = nodeOf.get(pressed)?.parent;
			// The return key in a field that submits nothing only puts the keyboard away.
			const returns = payload.events.some(
				(event) => event.host === host && event.event === 'enter',
			);
			// A row's copy (`<node>@<key>`) is not in the tree by that id: it activates as itself.
			const activates = !!pressed || host.includes('@');
			if ('tap' in action && !activates && touched.length === 0)
				throw new Error(`step ${index}: "${name}" is not a control and the press changed nothing`);
			const dispatched =
				'tap' in action
					? activates
						? runtime.dispatch({ event: 'activate', host: pressed ?? host })
						: []
					: 'type' in action
						? runtime.dispatch({ event: 'input', host, value: text! })
						: returns
							? runtime.dispatch({ event: 'enter', host })
							: [];
			apply(dispatched, index);
		}
		raiseLoadEvents(index);
		check(index, step);
		clock += 1000;
	}
	// What a host raises once the screen is drawn: `idle` for every element due one, `visible` for each above the fold.
	function raiseLoadEvents(index: number) {
		const foldText = belowFold === undefined ? undefined : [...texts].find(([, text]) => text === belowFold)?.[0];
		const foldNode = foldText === undefined ? -1 : payload.nodes.findIndex((node) => node.id === nodeOf.get(foldText.split('@')[0]!)?.parent);
		const aboveFold = (instance: string) =>
			foldNode < 0 || payload.nodes.findIndex((node) => node.id === instance.split('@')[0]) < foldNode;
		for (;;) {
			const idle = runtime.due('idle')[0];
			const visible = runtime.due('visible').find(aboveFold);
			const host = idle ?? visible;
			if (host === undefined) return;
			apply(runtime.dispatch({ event: idle === undefined ? 'visible' : 'idle', host }), index);
		}
	}
	function check(index: number, step: LadderStep) {
		expect(invalid, `step ${index}: the message of a blocked submit`).toBe(step.invalid);
		for (const [field, value] of Object.entries(step.fields ?? {})) {
			const host = elementReading(field);
			expect(host && fieldText(host), `step ${index}: the field "${field}"`).toBe(value);
		}
		if (step.calls) expect(calls, `step ${index}: the device calls made`).toEqual(step.calls);
		if (step.engineStarts !== undefined)
			expect(services.host.starts(), `step ${index}: the engine starts`).toBe(
				step.engineStarts,
			);
		if (step.microphone)
			expect(recording.size > 0 ? 'on' : 'off', `step ${index}: the microphone`).toBe(
				step.microphone,
			);
		if (step.camera) {
			const running =
				cameraPermission === 'granted' &&
				payload.nodes.some(
					(node) =>
						node.kind === 'element' && node.element === 'camera' && shownNode(node.id),
				);
			expect(running ? 'on' : 'off', `step ${index}: the camera session`).toBe(step.camera);
		}
		const shown = [
			...(styled
				? shownTexts()
						.filter(([id]) => !hiddenWithin(id))
						.map(([, text]) => text)
				: nativeShownTexts(
						payload,
						new Map(shownTexts().filter(([id]) => !hiddenWithin(id))),
					)),
			...labels()
				.filter(([id]) => !hiddenWithin(id))
				.map(([, label]) => label),
			...chosenLabels(),
		];
		expect(shown, `step ${index}`).toEqual(expect.arrayContaining([...step.visible]));
		for (const text of step.absent ?? []) expect(shown, `step ${index}`).not.toContain(text);
		for (const [node, value] of runtime.selections())
			expect(selected.get(node) ?? false, `step ${index}: the journal left ${node}'s selectedness stale`).toBe(value);
		expect(shown, `step ${index}: scrolled out of sight, still held`).toEqual(
			expect.arrayContaining([...(step.offScreen ?? [])]),
		);
		if (step.order)
			expect(shown.filter((text) => step.order!.includes(text))).toEqual(step.order);
		// `aria-disabled` reports a control as unavailable, as Maestro and Playwright read it, though a press still reaches it.
		for (const text of step.disabled ?? []) {
			const host = elementReading(text);
			expect(
				host &&
					(attributeNow(host, 'disabled') ??
						(attributeNow(host, 'aria-disabled') === 'true' ? '' : null)),
				`step ${index}: "${text}" is disabled`,
			).not.toBeNull();
		}
		expect(new Map(runtime.texts()), `step ${index}: the journal left a text stale`).toEqual(
			texts,
		);
		expect(
			new Map(runtime.attributes().map(([node, name, value]) => [`${node}\0${name}`, value])),
			`step ${index}: the journal left an attribute stale`,
		).toEqual(attributes);
		expect(
			new Map(runtime.checks()),
			`step ${index}: the journal left a checkbox stale`,
		).toEqual(checks);
		expect(
			new Map(runtime.properties().map(([node, , value]) => [node, value])),
			`step ${index}: the journal left a field stale`,
		).toEqual(properties);
		expect(
			new Map(runtime.sheets()),
			`step ${index}: a sheet shows what its state does not say`,
		).toEqual(sheetOpen);
	}
}

test.each(
	rungFolders().flatMap((folder) =>
		(['ios', 'android'] as const).map((target) => [folder, target] as const),
	),
)(
	'%s (%s): the native payload shows the web steps, or is refused by name',
	async (folder, target) => {
		const filename = join(proofsDir, folder, 'App.tsrx');
		const rung = readRung(folder);
		const page = rung.route === undefined ? undefined : `pages/${rung.route}.tsrx`;
		const build = await compileNativeComponent({
			filename,
			source: readFileSync(filename, 'utf8'),
			...(page ? { page } : {}),
			readModule: readWorkspaceModule,
			...readAppConfig(join(proofsDir, folder)),
			target,
		});
		const refusal = build.diagnostics.map((d) => d.message).join('; ');
		expect(
			build.payload === null,
			build.payload === null
				? `${folder} is refused but not listed in REFUSED_RUNGS: ${refusal}`
				: `${folder} lowers but is listed in REFUSED_RUNGS`,
		).toBe(REFUSED_RUNGS.has(folder));
		if (build.payload === null) {
			// Every refusal is named; a keyboard-only handler left out is a warning beside them, never the reason.
			expect(build.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
			const refusalCodes = new Set<string>([
				NATIVE_UNSUPPORTED,
				...Object.values(NATIVE_REFUSALS).map((refusal) => refusal.code),
			]);
			expect(
				build.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code]),
			).toEqual(
				build.diagnostics.map((diagnostic) =>
					diagnostic.severity === 'error' && refusalCodes.has(diagnostic.code)
						? ['error', diagnostic.code]
						: ['warning', NATIVE_KEYBOARD_ONLY],
				),
			);
			return;
		}
		const opened = page
			? matchRouteManifest(rung.start ?? '/', buildRouteManifestFromFileIds([page]))
			: undefined;
		if (page && !opened) throw new Error(`${folder}: ${rung.start} is not a path of ${page}`);
		const steps = rung.steps.map((step) => ({
			...step,
			visible: [...step.visible, ...(step.visibleOn?.[target] ?? [])],
		}));
		walk(
			build.payload,
			steps,
			opened?.params ?? {},
			rung.location,
			target,
			build.styles.length > 0 || build.stylesheets.length > 0,
			rung.belowFold,
		);
	},
);

test.each([...navRungFolders(), ...styleRungFolders(), ...sheetStyleRungFolders()])(
	'%s: the app payload walks the steps as a stack of screens',
	async (folder) => {
		const rung = readRung(folder);
		const build = await compileRungApp(join(proofsDir, folder), readAppConfig(join(proofsDir, folder)));
		expect(
			build.diagnostics.map((diagnostic) => `${diagnostic.page}: ${diagnostic.message}`),
		).toEqual([]);
		walkApp(
			build.payload!,
			rung.steps,
			rung.start ?? '/',
			new Set(build.styleInputs.map((input) => input.pattern)),
			rung.location,
		);
	},
);
