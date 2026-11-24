import { expect, it } from 'vitest';
import { compileNativeApp } from '../src/index.ts';

const page = (name: string, source: string) => ({ page: `pages/${name}.tsrx`, filename: `src/pages/${name}.tsrx`, source });

// A keyboard-only handler is a warning, so the page and the app still build (the checkin yardstick's settings page has two).
it('builds an app whose only diagnostics are warnings, and still reports them', async () => {
	const home = page(
		'index',
		`import { state } from '@markless/core';
export default function Home() @{
	let presses = state(0);
	<main>
		<button type="button" onClick={() => presses++} onKeyDown={() => presses++}>Pressed {presses}</button>
	</main>
}`,
	);
	const { payload, diagnostics } = await compileNativeApp({ pages: [home] });
	expect(diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code])).toEqual([['warning', 'MARKLESS_NATIVE_KEYBOARD_ONLY']]);
	expect(payload?.routes.map((route) => route.pattern)).toEqual(['/']);
});

it('still refuses the app when a page has an error', async () => {
	const home = page('index', `export default function Home() @{\n\t<main>\n\t\t<script>{'window.x = 1;'}</script>\n\t</main>\n}`);
	const { payload, diagnostics } = await compileNativeApp({ pages: [home] });
	expect(diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
	expect(payload).toBeNull();
});
