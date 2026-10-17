import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A client-rendered app gets the idle wake only from a module with an `onIdle` record, arms included.
const clientCode = async (name: string, arm: string) =>
	(
		await transformTsrxModule({
			filename: `/workspace/app/src/${name}.tsrx`,
			source: `
import { state } from '@markless/core';

export default function App() @{
	let open = state(false);

	<main>
		<button type="button" onClick={() => open = !open}>Open</button>
		@if (open) { ${arm} }
	</main>
}
`,
			environment: 'client',
		})
	).code;

test('a module with an onIdle host only inside an arm installs the idle wake', async () => {
	const code = await clientCode('IdleArm', '<p onIdle={() => {}}>later</p>');
	expect(code).toContain('@markless/web/fns/idle-trigger');
	expect(code).toContain('installMarklessIdle();');
});

test('a module without an onIdle host never names the trigger', async () => {
	const code = await clientCode('NoIdle', '<p onClick={() => {}}>now</p>');
	expect(code).not.toContain('idle-trigger');
	expect(code).not.toContain('installMarklessIdle');
});

test('only the resume module of a page with an onIdle record hands the runtime the idle queue', async () => {
	const resume = async (name: string, arm: string) =>
		(
			await transformTsrxModule({
				filename: `/workspace/app/src/${name}.tsrx`,
				source: `export default function App() @{
	<main><button type="button" onClick={() => {}}>Open</button>${arm}</main>
}
`,
				environment: 'client',
			})
		).virtualModules.find((module) => module.type === 'resume')?.source ?? '';
	expect(await resume('IdleResume', '<p onIdle={() => {}}>later</p>')).toContain(
		'installMarklessIdle();',
	);
	expect(await resume('PlainResume', '<p>now</p>')).not.toContain('idle-trigger');
});
