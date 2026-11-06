import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

// A `data:` URL import resolves no bare specifier, so the module-wide
// `@markless/web/fns/user-action` import every event-handler now carries
// (submit-quiet-design.md Q2) is stubbed rather than left to fail; this test
// only cares about the write the handler makes, not the user-action mark.
function stubUserActionImport(source: string): string {
	return `const marklessUserActionStart = () => {}, marklessUserActionEnd = () => {};\n${source.replace(
		/^import \{[^}]*\} from ['"]@markless\/web\/fns\/user-action['"];\n?/gm,
		'',
	)}`;
}

async function load(source: string) {
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(stubUserActionImport(source)).toString('base64')
	);
	return Object.values(loaded)[0] as (context: unknown) => unknown;
}

test('names bound by module-scope destructuring are carried into the modules that read them', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/app/pages/Overview.tsrx',
		source: `
import { computed, state } from '@markless/core';
const PANES = [{ id: 'summary' }, { id: 'activity' }, { id: 'notes' }];
const [firstPane, , ...laterPanes] = PANES;
const { fallback: { label: fallbackLabel = 'none' } } = { fallback: {} };
export function Overview() @{
 let pane = state('');
 const isFirst = computed(() => pane === firstPane.id);
 <>
  <button onClick={() => { pane = laterPanes[0].id + ':' + fallbackLabel; }}>{pane}</button>
  <p>{isFirst ? 'first' : 'other'}</p>
 </>
}
`,
		symbols: [],
		omitAuthoredSource: true,
	});
	expect(result.symbolModules.diagnostics).toEqual([]);

	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	const writes: unknown[] = [];
	(await load(handler.source))({ graph: { write: (record: unknown) => writes.push(record) } });
	expect(writes).toEqual([expect.objectContaining({ value: 'notes:none' })]);

	const derive = result.symbolModules.modules.find(
		(module) => module.kind === 'sync-computed-derive' && module.source.includes('firstPane'),
	)!;
	const isFirst = await load(derive.source);
	expect(isFirst({ graph: { read: () => 'summary' } })).toBe(true);
	expect(isFirst({ graph: { read: () => 'notes' } })).toBe(false);
});
