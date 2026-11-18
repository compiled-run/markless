import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '@markless/router';
import type { NativeValue, NativeViewPayload } from '@markless/serializer';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';
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
	};
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
	// A closed <dialog> shows nothing (the UA's dialog:not([open]) rule); the journal opens and closes it.
	const openDialogs = new Map(runtime.dialogs());
	const chosen = new Map(runtime.arms());
	const shownNode = (id: string): boolean => {
		const place = nodeOf.get(id)?.arm;
		return !place || (shownNode(place.branch) && chosen.get(place.branch) === place.index);
	};
	const inArm = (id: string, branch: string): boolean => {
		const node = nodeOf.get(id);
		if (!node?.arm) return false;
		return node.arm.branch === branch || inArm(node.arm.branch, branch);
	};
	// An element carrying `hidden`, bound or static, hides everything inside it, as the web's `[hidden]` rule does.
	const hiddenWithin = (id: string): boolean => {
		const at = id.indexOf('@');
		const suffix = at < 0 ? '' : id.slice(at);
		const node = nodeOf.get(at < 0 ? id : id.slice(0, at));
		if (!node) return false;
		if (node.kind === 'element') {
			if (openDialogs.get(id) === false) return true;
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
		// aria-labelledby names an element by the text of the elements it lists, as the hosts read it.
		const labelledBy = attribute('aria-labelledby');
		const label =
			attribute('aria-label') ??
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
		const node = [...texts].find(([id, shown]) => shown === text && !hiddenWithin(id))?.[0];
		return node ? parentOf(node) : undefined;
	};
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'relaunch' in action) {
			runtime = createNativeRuntime(payload, store, params);
			mount();
		} else if (action && !('tap' in action) && !('type' in action))
			throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
		else if (action) {
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
			const dispatched =
				'tap' in action
					? runtime.dispatch({ event: 'activate', host })
					: runtime.dispatch({ event: 'input', host, value: action.type.text });
			for (const entry of dispatched) {
				if (entry.op === 'text') texts.set(entry.node, entry.value);
				else if (entry.op === 'dialog') openDialogs.set(entry.node, entry.open);
				else if (entry.op === 'attribute')
					attributes.set(`${entry.node}\0${entry.name}`, entry.value);
				else if (entry.op === 'property') properties.set(entry.node, entry.value);
				else if (entry.op === 'navigate') {
					// One page per rung: a navigation opens this page again with the link's params.
					expect(entry.route, `step ${index}: the link's route`).toBe(payload.route?.pattern);
					runtime = createNativeRuntime(payload, store, entry.params);
					mount();
				} else if (entry.op === 'rows') {
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
					for (const id of texts.keys()) if (inArm(id, entry.node)) texts.delete(id);
					for (const key of attributes.keys())
						if (inArm(key.split('\0')[0]!, entry.node)) attributes.delete(key);
					for (const [id, text] of runtime.texts())
						if (inArm(id, entry.node)) texts.set(id, text);
					for (const [node, name, value] of runtime.attributes())
						if (inArm(node, entry.node)) attributes.set(`${node}\0${name}`, value);
				}
			}
		}
		for (const [field, value] of Object.entries(step.fields ?? {})) {
			const host = elementReading(field);
			expect(host && properties.get(host), `step ${index}: the field "${field}"`).toBe(value);
		}
		const shown = [
			...[...texts].filter(([id]) => !hiddenWithin(id)).map(([, text]) => text),
			...labels()
				.filter(([id]) => !hiddenWithin(id))
				.map(([, label]) => label),
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
			readModule: readWorkspaceModule,
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
