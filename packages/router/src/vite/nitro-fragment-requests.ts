import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { FRAGMENT_PATH_PREFIX } from './fragment-navigation.ts';

interface FragmentRequestNitro {
	readonly options: { readonly buildDir: string; plugins: string[] };
}

// Route rules, middleware and request files see the page path a fragment request names, so a guard on a page also guards its fragment.
export function fragmentRequestModule() {
	return {
		name: 'markless-router:fragment-requests',
		async setup(nitro: FragmentRequestNitro) {
			const dir = join(nitro.options.buildDir, 'markless-router');
			const plugin = join(dir, 'fragment-requests.mjs');
			await mkdir(dir, { recursive: true });
			await writeFile(
				plugin,
				[
					`const prefix = ${JSON.stringify(`${FRAGMENT_PATH_PREFIX}/`)};`,
					'export default function fragmentRequests(nitroApp) {',
					"\tnitroApp.hooks?.hook('request', (event) => {",
					'\t\tconst { pathname } = event.url;',
					'\t\tif (!pathname.startsWith(prefix)) return;',
					'\t\tconst page = new URL(event.url.href);',
					'\t\tpage.pathname = pathname.slice(prefix.length - 1);',
					'\t\tevent.url = page;',
					'\t});',
					'}',
					'',
				].join('\n'),
			);
			nitro.options.plugins.push(plugin);
		},
	};
}
