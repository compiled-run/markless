import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A client-rendered app gets the idle trigger only from a module whose markup has an `onIdle` host.
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

test('a module with an onIdle host only inside an arm installs the trigger', async () => {
	const code = await clientCode('IdleArm', '<p onIdle={() => {}}>later</p>');
	expect(code).toContain('@markless/web/fns/idle-trigger');
	expect(code).toContain('globalThis.__marklessIdleTrigger =');
});

test('a module without an onIdle host never names the trigger', async () => {
	const code = await clientCode('NoIdle', '<p onClick={() => {}}>now</p>');
	expect(code).not.toContain('idle-trigger');
	expect(code).not.toContain('__marklessIdleTrigger');
});
