import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { NativeViewPayload } from '@markless/serializer';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { proofsDir, readRung, rungFolders, type LadderStep } from '../proofs/ladder.ts';

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';

// A mirror host: it keeps what a device shows and changes it only through journal entries, as the hosts must.
function walk(payload: NativeViewPayload, steps: readonly LadderStep[]) {
	const store = new Map<string, string | number | boolean | null>();
	let runtime = createNativeRuntime(payload, store);
	const texts = new Map(runtime.texts());
	const attributes = new Map(runtime.attributes().map(([node, name, value]) => [`${node}\0${name}`, value]));
	const mount = () => {
		texts.clear();
		attributes.clear();
		chosen.clear();
		for (const [node, text] of runtime.texts()) texts.set(node, text);
		for (const [node, name, value] of runtime.attributes()) attributes.set(`${node}\0${name}`, value);
		for (const [node, index] of runtime.arms()) chosen.set(node, index);
	};
	const nodeOf = new Map(payload.nodes.map((node) => [node.id, node]));
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
		const node = [...texts].find(([, shown]) => shown === text)?.[0];
		return node ? nodeOf.get(node)?.parent ?? undefined : undefined;
	};
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'relaunch' in action) {
			runtime = createNativeRuntime(payload, store);
			mount();
		} else if (action && !('tap' in action))
			throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
		else if (action) {
			const host = elementReading(action.tap);
			if (!host) throw new Error(`step ${index}: nothing reads "${action.tap}" to tap`);
			if (attributes.get(`${host}\0disabled`) != null) throw new Error(`step ${index}: "${action.tap}" is disabled`);
			for (const entry of runtime.dispatch({ event: 'activate', host })) {
				if (entry.op === 'text') texts.set(entry.node, entry.value);
				else if (entry.op === 'attribute') attributes.set(`${entry.node}\0${entry.name}`, entry.value);
				else {
					chosen.set(entry.node, entry.index);
					for (const id of texts.keys()) if (inArm(id, entry.node)) texts.delete(id);
					for (const key of attributes.keys()) if (inArm(key.split('\0')[0]!, entry.node)) attributes.delete(key);
					for (const [id, text] of runtime.texts()) if (inArm(id, entry.node)) texts.set(id, text);
					for (const [node, name, value] of runtime.attributes())
						if (inArm(node, entry.node)) attributes.set(`${node}\0${name}`, value);
				}
			}
		}
		if (step.fields) throw new Error(`step ${index}: the payload cannot show fields`);
		const shown = [...texts.values(), ...labels().map(([, label]) => label)];
		expect(shown, `step ${index}`).toEqual(expect.arrayContaining([...step.visible]));
		for (const text of step.absent ?? []) expect(shown, `step ${index}`).not.toContain(text);
		if (step.order) expect(shown.filter((text) => step.order!.includes(text))).toEqual(step.order);
		for (const text of step.disabled ?? []) {
			const host = elementReading(text);
			expect(host && attributes.get(`${host}\0disabled`), `step ${index}: "${text}" is disabled`).not.toBeNull();
		}
		expect(new Map(runtime.texts()), `step ${index}: the journal left a text stale`).toEqual(texts);
		expect(
			new Map(runtime.attributes().map(([node, name, value]) => [`${node}\0${name}`, value])),
			`step ${index}: the journal left an attribute stale`,
		).toEqual(attributes);
	}
}

test.each(rungFolders())('%s: the native payload shows the web steps, or is refused by name', async (folder) => {
	const filename = join(proofsDir, folder, 'App.tsrx');
	const build = await compileNativeComponent({ filename, source: readFileSync(filename, 'utf8') });
	if (build.payload === null) {
		expect(build.diagnostics.length).toBeGreaterThan(0);
		expect(build.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
			build.diagnostics.map(() => NATIVE_UNSUPPORTED),
		);
		return;
	}
	walk(build.payload, readRung(folder).steps);
});
