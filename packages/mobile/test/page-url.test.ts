import { expect, test } from 'vitest';
import { createNativeAppRuntime } from '../src/app.ts';
import { compileNativeApp } from '../src/compile.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

const build = (pages: Record<string, string>, origin?: string) =>
	compileNativeApp({
		pages: Object.entries(pages).map(([file, source]) => ({
			page: file,
			filename: `packages/mobile/test/fixtures/${file}`,
			source,
		})),
		...(origin ? { origin } : {}),
	});

const shown = (app: ReturnType<typeof createNativeAppRuntime>) =>
	app
		.screens()
		.at(-1)!
		.runtime.texts()
		.map(([, text]) => text);

const listing = `import { computed } from '@markless/core';
import { Link, navigate, type PageProps } from '@markless/router';

function feedOf(search: string, here: string): string {
	return search === '' ? here : here + search;
}

export default function Listing({ params, url }: PageProps<{ kind: string }>) @{
	const feed = computed(() => feedOf(url.search, '/' + params.kind));
	const sort = computed(() => url.searchParams.get('sort') ?? 'none');
	<main>
		<p>{url.pathname}|{url.search}|{url.hash}</p>
		<p>{feed}</p>
		<p>{sort}</p>
		<Link href="/items/old?sort=age#list">Old</Link>
		<a href="/items/new?sort=name">New</a>
		<button onClick={() => navigate('/items/top?sort=score')}>Top</button>
	</main>
}`;

test("a page's url reads its pathname and query at mount and on each page a navigation with a query opens", async () => {
	for (const origin of [undefined, 'https://shop.example']) {
		const { payload, diagnostics } = await build(
			{ 'pages/items/[kind].tsrx': listing },
			origin,
		);
		expect(diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
		const app = createNativeAppRuntime(payload!, '/items/a%20b', new Map(), nodeScriptHost());
		expect(shown(app)).toEqual(expect.arrayContaining(['/items/a%20b||', '/a b', 'none']));
		const pressed = payload!.routes[0]!.page.events.filter(
			(event) => event.event === 'activate',
		).map((event) => event.host);
		const opened = pressed.map((host) => {
			const app = createNativeAppRuntime(payload!, '/items/a', new Map(), nodeScriptHost());
			app.dispatch({ event: 'activate', host });
			return shown(app).slice(0, 3);
		});
		expect(opened).toEqual(
			expect.arrayContaining([
				['/items/old|?sort=age|', '/old?sort=age', 'age'],
				['/items/new|?sort=name|', '/new?sort=name', 'name'],
				['/items/top|?sort=score|', '/top?sort=score', 'score'],
			]),
		);
		expect(opened).toHaveLength(3);
	}
});

test("a page's url members that need the app's origin are refused by name in a build with none", async () => {
	const page = (body: string) => `import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';

function whole(url: URL): string {
	return String(url);
}

export default function Page({ url }: PageProps) @{
	${body}
}`;
	const cases = [
		[
			`const where = computed(() => url.origin + url.pathname);\n\t<p>{where}</p>`,
			'reads `url.origin` of the page\'s url, which needs the app\'s origin; set app.json "origin"',
		],
		[
			`const where = computed(() => whole(url));\n\t<p>{where}</p>`,
			'uses the page\'s `url` whole, whose origin a phone knows only from app.json "origin"',
		],
		[`<p>{url.href}</p>`, "reads `.href` of the page's url"],
	] as const;
	for (const [body, message] of cases) {
		const without = await build({ 'pages/index.tsrx': page(body) });
		expect(without.diagnostics.map((d) => d.message)).toEqual(
			expect.arrayContaining([expect.stringContaining(message)]),
		);
		const withOrigin = await build({ 'pages/index.tsrx': page(body) }, 'https://shop.example');
		expect(
			withOrigin.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
		).toEqual([]);
		const app = createNativeAppRuntime(withOrigin.payload!, '/', new Map(), nodeScriptHost());
		expect(shown(app)).toEqual(
			expect.arrayContaining([expect.stringMatching(/^https:\/\/shop\.example\/?$/)]),
		);
	}
});
