import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// The escalation switch must cost a page that does not escalate nothing: no
// mark in its payload, and the per-arm plan it already shipped untouched.
test('a page whose branch the compiler can rebuild carries no escalation mark', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/Plain.tsrx',
		source: `
import { state } from '@markless/core';

export default function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <em class="plain">ready</em> }
	</main>
}
`,
		environment: 'client',
	});
	const payload = result.virtualModules.find((module) => module.type === 'payload');
	expect(payload?.source).not.toContain('escalates');
	expect(payload?.source).not.toContain('servedArmRecords');
	expect(payload?.source).toContain('armRecords');
});

// A page with no branch at all never reaches the switch.
test('a page with no branch carries neither field', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/NoBranch.tsrx',
		source: `
import { state } from '@markless/core';

export default function App() @{
	let hits = state(0);

	<main><button type="button" onClick={() => hits = hits + 1}>{hits}</button></main>
}
`,
		environment: 'client',
	});
	const payload = result.virtualModules.find((module) => module.type === 'payload');
	expect(payload?.source).not.toContain('escalates');
	expect(payload?.source).not.toContain('servedArmRecords');
});
