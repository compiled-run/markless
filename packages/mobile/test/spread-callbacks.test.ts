import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';

test("a callback a part spreads onto its element runs after the part's own handler there, as data or as JavaScript", async () => {
	const { payload, diagnostics } = await compileNativeComponent({
		filename: 'packages/mobile/proofs/r117-spread-callback/App.tsrx',
		source: readFileSync(join(import.meta.dirname, '../proofs/r117-spread-callback/App.tsrx'), 'utf8'),
		readModule: readWorkspaceModule,
	});
	expect(diagnostics).toEqual([]);
	expect(payload!.events.map((event) => [event.host, event.event])).toEqual([
		['component-edge:0/h0', 'activate'],
		['component-edge:1/h0', 'activate'],
	]);
	const [red, blue] = payload!.handlers;
	expect(red!.ops.map((op) => [op.op, 'cell' in op ? op.cell : undefined])).toEqual([
		['assign', 'component-edge:0/state:presses'],
		['assign', 'state:picked'],
	]);
	expect(blue!.ops).toMatchObject([
		{ op: 'assign', cell: 'component-edge:1/state:presses' },
		{ op: 'script', type: 'click', bindings: { picked: { cell: 'state:picked' } } },
	]);
});
