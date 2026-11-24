import { buildRouteManifestFromFileIds, matchRouteManifest } from '@markless/router';
import { expect, test } from 'vitest';
import { createNativeAppRuntime } from '../src/app.ts';
import { compileNativeApp } from '../src/compile.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

const page = (body: string) => `import { navigate } from '@markless/router';
export default function Page() @{
	${body}
}`;
const pages = {
	'pages/index.tsrx': page('<h1>Home</h1>'),
	'pages/notes/new.tsrx': page('<h1>New note</h1>'),
	'pages/notes/[id]/edit.tsrx': page('<h1>Edit</h1>'),
	'pages/docs/[...rest].tsrx': page('<h1>Docs</h1>'),
	'pages/notes/[id].tsrx': `import { state } from '@markless/core';
import { navigate } from '@markless/router';
export default function Note() @{
	let href = state('');
	let problem = state('none');
	<main>
		<input onInput={(event) => (href = event.currentTarget.value)} />
		<button
			onClick={async () => {
				try {
					await navigate(href);
				} catch (error) {
					problem = (error as Error).message;
				}
			}}
		>
			Go
		</button>
		<p>{problem}</p>
	</main>
}`,
};
const manifest = buildRouteManifestFromFileIds(Object.keys(pages));
const here = 'https://app.test/notes/7';

/** What the web's router does with `navigate(href)` from /notes/7: keeps the page, or opens a route with its params and query. */
function onTheWeb(href: string) {
	const url = new URL(href, here);
	const now = new URL(here);
	if (url.pathname + url.search === now.pathname + now.search && !url.hash.startsWith('#/'))
		return 'kept';
	const match = matchRouteManifest(url.pathname, manifest);
	if (!match) return 'missing';
	if (match.route.params.some((param) => param.kind === 'catch-all')) return 'catch-all';
	// A phone keeps params URL-decoded, as its deep links and links give them.
	const params = Object.fromEntries(
		Object.entries(match.params).map(([name, value]) => [
			name,
			value.split('/').map(decodeURIComponent).join('/'),
		]),
	);
	return { route: match.route.pattern, params, search: url.search };
}

test('navigate() from JavaScript on a phone resolves a path built while it runs as the web resolves and routes it', async () => {
	const build = await compileNativeApp({
		pages: Object.entries(pages).map(([file, source]) => ({
			page: file,
			filename: `packages/mobile/test/fixtures/${file}`,
			source,
		})),
	});
	expect(build.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
	const hrefs = [
		'',
		'#top',
		'?tab=1',
		'/notes/7?tab=1',
		'/notes/new',
		'/notes/42',
		'42',
		'../notes/43',
		'./edit',
		'7/edit',
		'/notes/7/edit',
		'/notes/a%20b',
		'/notes/a b',
		'/notes/%E2%82%AC',
		'/notes/é',
		'/notes/42/',
		'/a/../notes/9',
		'/notes/./9',
		'/notes/9/..',
		'/notes/9/edit/..',
		'/docs/a/b/c',
		'/docs/x%2Fy',
		'/nowhere',
		'/notes/',
		'\\notes\\8',
		' /notes/8 ',
		'/notes/8\t',
	];
	for (const href of hrefs) {
		const app = createNativeAppRuntime(build.payload!, '/notes/7', new Map(), nodeScriptHost());
		app.dispatch({ event: 'input', host: 'h1', value: href });
		const journal = app.dispatch({ event: 'activate', host: 'h2' });
		const opened = journal.find((entry) => entry.op === 'navigate');
		const problem = app.screens()[1]!.runtime.texts().find(([id]) => id === 'h3:text0')?.[1];
		const web = onTheWeb(href);
		if (web === 'kept') expect([href, opened, problem]).toEqual([href, undefined, 'none']);
		else if (web === 'catch-all')
			expect([href, problem]).toEqual([href, expect.stringContaining('a catch-all page, which a phone does not open yet')]);
		else if (web === 'missing') expect([href, problem]).toEqual([href, expect.stringContaining('is not a page of this app')]);
		else
			expect([
				href,
				opened && { route: opened.route, params: opened.params, search: opened.search ?? '' },
			]).toEqual([href, web]);
	}
});

test('navigate() to another origin is refused at run time: a phone app has no browser to load it in', async () => {
	const build = await compileNativeApp({
		pages: Object.entries(pages).map(([file, source]) => ({
			page: file,
			filename: `packages/mobile/test/fixtures/${file}`,
			source,
		})),
	});
	for (const href of ['https://example.com/', '//example.com/notes/1', 'mailto:a@example.com']) {
		const app = createNativeAppRuntime(build.payload!, '/notes/7', new Map(), nodeScriptHost());
		app.dispatch({ event: 'input', host: 'h1', value: href });
		const journal = app.dispatch({ event: 'activate', host: 'h2' });
		expect(journal.some((entry) => entry.op === 'navigate')).toBe(false);
		expect(app.screens()[1]!.runtime.texts().find(([id]) => id === 'h3:text0')?.[1]).toBe(
			`navigate() to ${href} leaves the app, and a phone app has no browser to load it in`,
		);
	}
});
