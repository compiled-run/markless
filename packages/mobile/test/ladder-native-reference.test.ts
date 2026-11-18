import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '@markless/router';
import type { NativeValue, NativeViewPayload } from '@markless/serializer';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { readRelativeModule } from '../src/harness/rung.ts';
import { proofsDir, readRung, rungFolders, type LadderStep } from '../proofs/ladder.ts';

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';

// A mirror host: it keeps what a device shows and changes it only through journal entries, as the hosts must.
function walk(
	payload: NativeViewPayload,
	steps: readonly LadderStep[],
	params: Readonly<Record<string, string>>,
) {
	const store = new Map<string, NativeValue>();
	let runtime = createNativeRuntime(payload, store, params);
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
	};
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
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
	const shownNode = (id: string): boolean => {
		if (inClosedSheet(id)) return false;
		const place = nodeOf.get(id)?.arm;
		return !place || (shownNode(place.branch) && chosen.get(place.branch) === place.index);
	};
	const openSheet = (index: number): string => {
		const open = [...sheetOpen].filter(([, isOpen]) => isOpen).map(([node]) => node);
		if (open.length !== 1)
			throw new Error(`step ${index}: ${open.length} system sheets are open`);
		return open[0]!;
	};
	const shownTexts = () => [...texts].filter(([node]) => shownNode(node));
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
	const elementReading = (text: string) => {
		const labelled = labels().find(([, label]) => label === text)?.[0];
		if (labelled) return labelled;
		const node = shownTexts().find(([, shown]) => shown === text)?.[0];
		return node ? (nodeOf.get(node)?.parent ?? undefined) : undefined;
	};
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'relaunch' in action) {
			runtime = createNativeRuntime(payload, store, params);
			mount();
		} else if (action && 'swipe' in action) openSheet(index);
		else if (action && 'scrollTo' in action) {
			openSheet(index);
			if (!shownTexts().some(([, text]) => text === action.scrollTo))
				throw new Error(`step ${index}: "${action.scrollTo}" is not in the open sheet`);
		} else if (action && !('tap' in action) && !('type' in action) && !('dismiss' in action))
			throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
		else if (action && 'dismiss' in action) {
			const sheet = openSheet(index);
			const node = nodeOf.get(sheet);
			if (node?.kind !== 'sheet' || !node.dismissible)
				throw new Error(`step ${index}: ${sheet} cannot be dismissed`);
			sheetOpen.set(sheet, false);
			apply(runtime.dispatch({ event: 'dismiss', host: sheet }), index);
		} else if (action) {
			const name = 'tap' in action ? action.tap : action.type.field;
			const host = elementReading(name);
			if (!host)
				throw new Error(
					`step ${index}: nothing reads "${name}" to ${'tap' in action ? 'tap' : 'type into'}`,
				);
			if (attributes.get(`${host}\0disabled`) != null)
				throw new Error(`step ${index}: "${name}" is disabled`);
			// Typing shows the text in the field at once; the input event then runs the handler.
			if ('type' in action) properties.set(host, action.type.text);
			apply(
				'tap' in action
					? runtime.dispatch({ event: 'activate', host })
					: runtime.dispatch({ event: 'input', host, value: action.type.text }),
				index,
			);
		}
		check(index, step);
	}
	function apply(dispatched: ReturnType<typeof runtime.dispatch>, index: number) {
		for (const entry of dispatched) {
			if (entry.op === 'text') texts.set(entry.node, entry.value);
			else if (entry.op === 'attribute')
				attributes.set(`${entry.node}\0${entry.name}`, entry.value);
			else if (entry.op === 'property') properties.set(entry.node, entry.value);
			else if (entry.op === 'navigate') {
				// One page per rung: a navigation opens this page again with the link's params.
				expect(entry.route, `step ${index}: the link's route`).toBe(payload.route?.pattern);
				runtime = createNativeRuntime(payload, store, entry.params);
				mount();
			} else if (entry.op === 'rows') {
				const rowNodes = payload.nodes
					.filter((node) => node.row === entry.node)
					.map((node) => node.id);
				const instanceOf = (id: string) => {
					const at = id.indexOf('@');
					return at < 0 ? null : { node: id.slice(0, at), key: id.slice(at + 1) };
				};
				const kept = new Map<string, string>();
				for (const [id, text] of texts) {
					const instance = instanceOf(id);
					if (!instance || !rowNodes.includes(instance.node)) continue;
					texts.delete(id);
					if (entry.keys.includes(instance.key)) kept.set(id, text);
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
			} else if (entry.op === 'sheet') sheetOpen.set(entry.node, entry.open);
		}
	}
	function check(index: number, step: LadderStep) {
		for (const [field, value] of Object.entries(step.fields ?? {})) {
			const host = elementReading(field);
			expect(host && properties.get(host), `step ${index}: the field "${field}"`).toBe(value);
		}
		const shown = [
			...shownTexts().map(([, text]) => text),
			...labels().map(([, label]) => label),
		];
		expect(shown, `step ${index}`).toEqual(expect.arrayContaining([...step.visible]));
		for (const text of step.absent ?? []) expect(shown, `step ${index}`).not.toContain(text);
		if (step.order)
			expect(shown.filter((text) => step.order!.includes(text))).toEqual(step.order);
		for (const text of step.disabled ?? []) {
			const host = elementReading(text);
			expect(
				host && attributes.get(`${host}\0disabled`),
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
			new Map(runtime.properties().map(([node, , value]) => [node, value])),
			`step ${index}: the journal left a field stale`,
		).toEqual(properties);
		expect(
			new Map(runtime.sheets()),
			`step ${index}: a sheet shows what its state does not say`,
		).toEqual(sheetOpen);
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
