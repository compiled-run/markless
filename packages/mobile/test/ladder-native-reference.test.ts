import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '@markless/router';
import type { NativeJournalEntry, NativeValue, NativeViewPayload } from '@markless/serializer';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { readRelativeModule } from '../src/harness/rung.ts';
import type { DeviceAppConfig } from '../src/permissions.ts';
import {
	proofsDir,
	readRung,
	rungFolders,
	type LadderRung,
	type LadderStep,
} from '../proofs/ladder.ts';

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';

// A mirror host: it keeps what a device shows and changes it only through journal entries, as the hosts must.
function walk(
	payload: NativeViewPayload,
	steps: readonly LadderStep[],
	params: Readonly<Record<string, string>>,
	position: LadderRung['location'],
) {
	const store = new Map<string, NativeValue>();
	const calls: string[] = [];
	// A fake device, as a host's: location permission, where it is, and the calls waiting on the person's answer.
	let permission: 'unknown' | 'granted' | 'denied' = 'unknown';
	let waiting: string[] = [];
	const deviceValue = (name: string): NativeValue =>
		name === 'location.access'
			? permission
			: name === 'network.online'
				? true
				: (() => {
						throw new Error(`no fake ${name}`);
					})();
	const answer = (cell: string) =>
		permission === 'granted'
			? runtime.dispatch({ event: 'settle', cell, value: { ...position!, accuracy: 5 } })
			: runtime.dispatch({
					event: 'settle',
					cell,
					error: { name: 'NotAllowedError', message: 'Location was refused' },
				});
	const start = () => {
		const r = createNativeRuntime(payload, store, params);
		for (const cell of payload.cells)
			if (cell.device)
				r.dispatch({ event: 'device', cell: cell.id, value: deviceValue(cell.device) });
		return r;
	};
	let runtime = start();
	const startTasks = () => {
		waiting = [];
		for (const task of runtime.tasks()) {
			if (permission === 'unknown') waiting.push(task.result!);
			else apply(answer(task.result!), -1);
		}
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
		return node ? (nodeOf.get(node)?.parent ?? undefined) : undefined;
	};
	function apply(dispatched: ReadonlyArray<NativeJournalEntry>, index: number) {
		for (const entry of dispatched) {
			if (entry.op === 'call') calls.push(entry.call);
			else if (entry.op === 'text') texts.set(entry.node, entry.value);
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
			}
		}
	}
	startTasks();
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && 'relaunch' in action) {
			if (action.permissions?.location === 'unset') permission = 'unknown';
			runtime = start();
			mount();
			startTasks();
		} else if (action && 'device' in action) {
			for (const [name, value] of Object.entries(action.device))
				for (const cell of payload.cells)
					if (cell.device === name)
						apply(runtime.dispatch({ event: 'device', cell: cell.id, value }), index);
		} else if (action && 'answer' in action) {
			permission = action.answer === 'allow' ? 'granted' : 'denied';
			for (const cell of payload.cells)
				if (cell.device === 'location.access')
					apply(
						runtime.dispatch({ event: 'device', cell: cell.id, value: permission }),
						index,
					);
			for (const cell of waiting.splice(0)) apply(answer(cell), index);
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
			apply(dispatched, index);
		}
		for (const [field, value] of Object.entries(step.fields ?? {})) {
			const host = elementReading(field);
			expect(host && properties.get(host), `step ${index}: the field "${field}"`).toBe(value);
		}
		if (step.calls) expect(calls, `step ${index}: the device calls made`).toEqual(step.calls);
		const shown = [...texts.values(), ...labels().map(([, label]) => label)];
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

// A rung's app config (`app.json`): the device usage text a native build needs.
const appConfig = (folder: string): { device?: DeviceAppConfig } => {
	const file = join(proofsDir, folder, 'app.json');
	return existsSync(file)
		? (JSON.parse(readFileSync(file, 'utf8')) as { device?: DeviceAppConfig })
		: {};
};

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
			readModule: readRelativeModule,
			...appConfig(folder),
			target,
		});
		if (build.payload === null) {
			// The device ladder's rungs are only written once they lower.
			expect(
				typeof rung.rung,
				`${folder} is refused: ${build.diagnostics.map((d) => d.message).join('; ')}`,
			).toBe('number');
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
		const steps = rung.steps.map((step) => ({
			...step,
			visible: [...step.visible, ...(step.visibleOn?.[target] ?? [])],
		}));
		walk(build.payload, steps, opened?.params ?? {}, rung.location);
	},
);
