import { expect, it } from 'vitest';
import { compileNativeApp, compileNativeComponent } from '../src/index.ts';

const page = (name: string, source: string) => ({
	page: `pages/${name}.tsrx`,
	filename: `src/pages/${name}.tsrx`,
	source,
});
const home = page(
	'index',
	`import { Link } from '@markless/router';
export default function Home() @{
	<main>
		<Link href="/settings">Settings</Link>
	</main>
}`,
);
const settings = page(
	'settings',
	`import { state } from '@markless/core';
export default function Settings() @{
	let open = state(false);
	<main>
		<span role="button" tabindex="0" onClick={() => (open = !open)} onKeyDown={() => (open = !open)}>Settings</span>
		<p class="state">{open ? 'open' : 'closed'}</p>
		<style>
			.state { color: rebeccapurple; }
		</style>
	</main>
}`,
);
const refused = page(
	'report',
	`export default function Report() @{
	<main>
		<script>{'window.opened = true;'}</script>
	</main>
}`,
);

it('builds an app whose pages carry only warnings, as a single page with only warnings builds, and keeps the warnings', async () => {
	const single = await compileNativeComponent({ ...settings, page: settings.page });
	expect(single.payload).not.toBeNull();
	expect(single.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code])).toEqual([
		['warning', 'MARKLESS_NATIVE_KEYBOARD_ONLY'],
	]);

	const app = await compileNativeApp({ pages: [home, settings] });
	expect(app.payload?.routes.map((route) => route.pattern)).toEqual(['/', '/settings']);
	expect(app.styleInputs.map((input) => input.pattern)).toEqual(['/settings']);
	expect(
		app.diagnostics.map((diagnostic) => [
			diagnostic.page,
			diagnostic.severity,
			diagnostic.code,
		]),
	).toEqual([['pages/settings.tsrx', 'warning', 'MARKLESS_NATIVE_KEYBOARD_ONLY']]);
});

it('builds no app when a page has an error, as that page alone has no build, unless the app keeps the pages that build', async () => {
	expect((await compileNativeComponent({ ...refused, page: refused.page })).payload).toBeNull();

	const app = await compileNativeApp({ pages: [home, settings, refused] });
	expect(app.payload).toBeNull();
	expect(app.styleInputs).toEqual([]);
	expect(
		app.diagnostics
			.map((diagnostic) => [diagnostic.page, diagnostic.severity])
			.filter(([, severity]) => severity === 'error'),
	).not.toEqual([]);

	const partial = await compileNativeApp({ pages: [home, settings, refused], partial: true });
	expect(partial.payload?.routes.map((route) => route.pattern)).toEqual(['/', '/settings']);
	expect(partial.styleInputs.map((input) => input.pattern)).toEqual(['/settings']);
});
