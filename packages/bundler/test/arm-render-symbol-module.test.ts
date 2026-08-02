import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// Chunk commits deleted async-boundary-update symbol modules: settled arms are
// now browser-parsed native templates, while only the async runner remains a
// demand-loaded symbol. Keep this focused artifact contract beside the broader
// native-markup integration tests so the deleted symbol cannot creep back in.
test('settled arms stay native chunks and only their runner is demand-loadable', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/IssuesPage.tsrx',
		source: `
import { computed } from '@markless/core';
import { Shell } from './shell.tsrx';

export default function Page() @{
	const view = computed(async () => ({ title: 'Issues', repos: [{ id: 'a' }] }));
	<main>
		@try {
			<>
				<Shell title={view.title} />
				<ul class="rows">
					@for (const r of view.repos; key r.id) { <li class="row">{r.id}</li> }
				</ul>
			</>
		} @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		environment: 'client',
	});

	expect(result.manifest.symbols.some((symbol) => symbol.kind === 'async-boundary-update')).toBe(
		false,
	);
	const native = result.manifest.csrNativeMarkup?.[0];
	const armChunks = native?.definition.chunks.filter((chunk) => chunk.kind === 'async-arm');
	expect(armChunks?.map((chunk) => chunk.id)).toEqual([
		'async:boundary:0:arm:try',
		'async:boundary:0:arm:pending',
		'async:boundary:0:arm:catch',
	]);
	for (const chunk of armChunks ?? []) {
		expect(chunk.nativeTemplateId).toEqual(expect.any(String));
		expect(native?.templates.some((template) => template.id === chunk.nativeTemplateId)).toBe(
			true,
		);
	}
	const runner = result.manifest.symbols.find(
		(symbol) => symbol.kind === 'async-computed-runner',
	);
	expect(runner).toBeDefined();
	const resolver = result.virtualModules.find((module) => module.type === 'resolver');
	expect(resolver?.source).toContain(`import(/* @vite-ignore */ "${runner!.virtualModuleId}")`);
	expect(result.code).toContain('from "./shell.tsrx"');
	expect(result.code).toContain('from "@markless/web/fns/csr"');
});
