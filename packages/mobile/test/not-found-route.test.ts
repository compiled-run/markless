import { join } from 'node:path';
import { expect, it } from 'vitest';
import { NATIVE_NOT_FOUND_ROUTE } from '@markless/serializer/native-view';
import { compileRungApp } from '../src/harness/rung.ts';
import { compileNativeApp } from '../src/index.ts';

it("carries the app's 404 page as a route whose page names that route, as each host checks", async () => {
	const { payload, diagnostics } = await compileRungApp(join(import.meta.dirname, '..', 'proofs', 'n5-not-found'));
	expect(diagnostics).toEqual([]);
	expect(payload?.routes.map((route) => [route.pattern, route.page.route?.pattern])).toEqual([
		['/', '/'],
		[NATIVE_NOT_FOUND_ROUTE, NATIVE_NOT_FOUND_ROUTE],
	]);
});

it('leaves no link to a page that did not build: it opens the 404 page, or does nothing when the app has none', async () => {
	const page = (name: string, source: string) => ({ page: `pages/${name}.tsrx`, filename: `src/pages/${name}.tsrx`, source });
	const home = page(
		'index',
		`import { Link } from '@markless/router';
export default function Home() @{
	<main>
		<Link href="/report">Open report</Link>
	</main>
}`,
	);
	const report = page(
		'report',
		`export default function Report() @{
	<main>
		<script>{'window.opened = true;'}</script>
	</main>
}`,
	);
	const notFound = page('404', `export default function NotFound() @{\n\t<h1>Page not found</h1>\n}`);
	const navigates = (app: NonNullable<Awaited<ReturnType<typeof compileNativeApp>>['payload']>) =>
		app.routes.flatMap((route) =>
			route.page.handlers.flatMap((handler) => handler.ops.flatMap((op) => (op.op === 'navigate' ? [op.route] : []))),
		);

	const withPage = await compileNativeApp({ pages: [home, report, notFound], partial: true });
	expect(withPage.payload?.routes.map((route) => route.pattern)).toEqual(['/', NATIVE_NOT_FOUND_ROUTE]);
	expect(navigates(withPage.payload!)).toEqual([NATIVE_NOT_FOUND_ROUTE]);

	const without = await compileNativeApp({ pages: [home, report], partial: true });
	expect(without.payload?.routes.map((route) => route.pattern)).toEqual(['/']);
	expect(navigates(without.payload!)).toEqual([]);
	const anchor = without.payload!.routes[0]!.page.nodes.find((node) => node.kind === 'element' && node.element === 'a');
	expect(anchor).toBeDefined();
	expect(without.payload!.routes[0]!.page.events.filter((event) => event.host === anchor!.id)).toEqual([]);
});
