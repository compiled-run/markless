import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { NativeViewPayload } from '@markless/serializer';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { proofsDir, readRung, rungFolders, type LadderStep } from '../proofs/ladder.ts';

// The native column before any device: each rung's payload, run by the reference runtime, must show what the
// web build shows; a rung the compiler cannot lower yet must be refused by name, never emitted half right.
const NATIVE_UNSUPPORTED = 'MARKLESS_NATIVE_UNSUPPORTED';

function walk(payload: NativeViewPayload, steps: readonly LadderStep[]) {
	const runtime = createNativeRuntime(payload);
	const texts = new Map(runtime.texts());
	const parentOf = new Map(payload.nodes.map((node) => [node.id, node.parent]));
	for (const [index, step] of steps.entries()) {
		const action = step.do;
		if (action && !('tap' in action))
			throw new Error(`step ${index}: the payload has no way to ${Object.keys(action)[0]}`);
		if (action) {
			const target = [...texts].find(([, text]) => text === action.tap)?.[0];
			if (!target) throw new Error(`step ${index}: nothing reads "${action.tap}" to tap`);
			for (const entry of runtime.dispatch({ event: 'activate', host: parentOf.get(target)! }))
				texts.set(entry.node, entry.value);
		}
		for (const unsupported of ['disabled', 'fields'] as const)
			if (step[unsupported]) throw new Error(`step ${index}: the payload cannot show ${unsupported}`);
		const shown = [...texts.values()];
		expect(shown, `step ${index}`).toEqual(expect.arrayContaining([...step.visible]));
		for (const text of step.absent ?? []) expect(shown, `step ${index}`).not.toContain(text);
		if (step.order) expect(shown.filter((text) => step.order!.includes(text))).toEqual(step.order);
		expect(new Map(runtime.texts()), `step ${index}: the journal left a view stale`).toEqual(texts);
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
