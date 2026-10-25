import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { PROTOCOL_KEEP_SHARED_PREFIX } from '@markless/web/fns/keep-parts';
import { FRAGMENT_PATH_PREFIX, FRAGMENT_RESPONSE_HEADER } from './fragment-navigation.ts';

interface FragmentRequestNitro {
	readonly options: {
		readonly buildDir: string;
		plugins: string[];
		routeRules?: Record<string, Record<string, unknown>>;
	};
	readonly hooks?: { hook(name: 'build:before', handler: () => void): unknown };
}

// A fragment address that names kept parts (/_markless/fragment/~a~b/docs) caches like the plain one, once a host has
// a rule for it: each fragment rule gets a twin one segment deeper. Exact rules still win over these.
export function mirrorKeptPartRules(rules: Record<string, Record<string, unknown>>): void {
	const prefix = `${FRAGMENT_PATH_PREFIX}/`;
	for (const [path, rule] of Object.entries(rules)) {
		if (!path.startsWith(prefix) || path.startsWith(`${prefix}*/`)) continue;
		const twin = `${prefix}*/${path.slice(prefix.length)}`;
		if (rules[twin]) continue;
		const { prerender: _prerender, ...cached } = rule;
		rules[twin] = cached;
	}
}

// Route rules, middleware and request files see the page path a fragment request names, so a guard on a page also guards its fragment.
export function fragmentRequestModule() {
	return {
		name: 'markless-router:fragment-requests',
		async setup(nitro: FragmentRequestNitro) {
			// After every module has set its rules.
			nitro.hooks?.hook('build:before', () => {
				if (nitro.options.routeRules) mirrorKeptPartRules(nitro.options.routeRules);
			});
			const dir = join(nitro.options.buildDir, 'markless-router');
			const plugin = join(dir, 'fragment-requests.mjs');
			await mkdir(dir, { recursive: true });
			await writeFile(
				plugin,
				[
					`const prefix = ${JSON.stringify(`${FRAGMENT_PATH_PREFIX}/`)};`,
					`const marker = ${JSON.stringify(FRAGMENT_RESPONSE_HEADER)};`,
					// The kept parts a fragment address names are not part of the page path.
					`const kept = new RegExp(${JSON.stringify(`^/(?:${PROTOCOL_KEEP_SHARED_PREFIX}[0-9a-z]+)+(?=/)`)});`,
					'const fragments = new WeakSet();',
					'export default function fragmentRequests(nitroApp) {',
					"\tnitroApp.hooks?.hook('request', (event) => {",
					'\t\tconst { pathname } = event.url;',
					'\t\tif (!pathname.startsWith(prefix)) return;',
					'\t\tconst page = new URL(event.url.href);',
					"\t\tpage.pathname = pathname.slice(prefix.length - 1).replace(kept, '');",
					'\t\tevent.url = page;',
					'\t\tfragments.add(event);',
					// A header of its own makes h3 rebuild a returned Response, so even Response.redirect's headers can be rewritten.
					"\t\tevent.res?.headers?.set(marker, '1');",
					'\t});',
					// A redirect to another page of this app stays a fragment, so the router lands on it in place.
					"\tnitroApp.hooks?.hook('response', (response, event) => {",
					'\t\tif (!fragments.has(event) || response.status < 300 || response.status > 399) return;',
					"\t\tconst location = response.headers.get('location');",
					'\t\tif (!location) return;',
					'\t\tconst target = new URL(location, event.url);',
					'\t\tif (target.origin !== event.url.origin || target.pathname.startsWith(prefix)) return;',
					'\t\ttarget.pathname = prefix.slice(0, -1) + target.pathname;',
					'\t\ttry {',
					"\t\t\tresponse.headers.set('location', target.href);",
					'\t\t} catch {}',
					'\t});',
					'}',
					'',
				].join('\n'),
			);
			nitro.options.plugins.push(plugin);
		},
	};
}
