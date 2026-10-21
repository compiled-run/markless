// Writes a router app whose size is set by its arguments: pages that each use some of a pool of
// stateful components, and a document whose body extras render one portaled layer per page.
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const packagesRoot = resolve(import.meta.dirname, '../../../packages');

/** Deterministic pick of `count` distinct indexes below `size` for one page. */
function pick(page, count, size) {
	const chosen = new Set();
	let seed = (page + 1) * 2654435761;
	while (chosen.size < Math.min(count, size)) {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		chosen.add(seed % size);
	}
	return [...chosen].sort((a, b) => a - b);
}

function componentSource(index) {
	const rows = Array.from(
		{ length: 6 },
		(_, row) => `<li class="row-${row}"><span>Item ${row} of widget ${index}</span></li>`,
	).join('\n\t\t\t');
	return `import { state } from '@markless/core';

export default function Widget${index}({ label }: { label: string }) @{
	let open = state(false);
	let count = state(0);
	let draft = state('');
	let tags = state(['alpha', 'beta', 'gamma']);

	<section class="widget widget-${index}" data-widget="${index}">
		<h2>{label} widget ${index}</h2>
		<button type="button" aria-expanded={open} onClick={() => (open = !open)}>Toggle</button>
		<button type="button" onClick={() => count++}>Count {count}</button>
		<input value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
		<button type="button" onClick={() => (tags = [...tags, draft || 'new'])}>Add</button>
		@if (open) {
			<>
				<p class="panel">Panel of widget ${index}: {draft}</p>
			</>
		}
		<ul>
			@for (const tag of tags; key tag) {
				<li>{tag}</li>
			}
		</ul>
		<ol>
			${rows}
		</ol>
	</section>
}
`;
}

function layerSource(index, layerBytes) {
	const paragraph = `<p>Layer ${index} holds portaled content that a page opens on use, written out in full so its markup is large.</p>`;
	const repeat = Math.max(1, Math.round(layerBytes / paragraph.length));
	return `import { state } from '@markless/core';

export default function Layer${index}() @{
	let shown = state(false);

	<div role="dialog" class="layer layer-${index}" hidden={!shown}>
		<button type="button" onClick={() => (shown = !shown)}>Close layer ${index}</button>
		${Array.from({ length: repeat }, () => paragraph).join('\n\t\t')}
	</div>
}
`;
}

function pageSource(page, widgets) {
	const imports = widgets.map((w) => `import Widget${w} from '../components/widget-${w}.tsrx';`);
	const uses = widgets.map((w) => `\t\t<Widget${w} label="Page ${page}" />`);
	return `${imports.join('\n')}

export default function Page${page}() @{
	<main data-page="${page}">
		<h1>Page ${page}</h1>
${uses.join('\n')}
	</main>
}
`;
}

function bodyExtrasSource(layers) {
	const imports = Array.from(
		{ length: layers },
		(_, i) => `import Layer${i} from './layers/layer-${i}.tsrx';`,
	);
	const cases = Array.from(
		{ length: layers },
		(_, i) => `\t\t\t@case '/p${i}/': { <Layer${i} /> }`,
	);
	return `${imports.join('\n')}

export default function BodyExtras({ route }: { readonly route: string }) @{
	<div class="extras">
		@switch (route) {
${cases.join('\n')}
			@default: { <span hidden /> }
		}
	</div>
}
`;
}

const documentSource = `import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import BodyExtras from './components/body-extras.tsrx';

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<title>Build scale</title>
		</head>
		<body>
			{children}
			<BodyExtras route={url?.pathname ?? '/'} />
		</body>
	</Html>
}
`;

/**
 * @param {{ dir: string, pages: number, components?: number, perPage?: number, layers?: number, layerBytes?: number }} options
 */
export async function generateBuildScaleApp(options) {
	const { dir, pages } = options;
	const components = options.components ?? 200;
	const perPage = options.perPage ?? 20;
	const layers = options.layers ?? pages;
	const layerBytes = options.layerBytes ?? 4_000;
	await rm(dir, { recursive: true, force: true });
	await mkdir(join(dir, 'pages'), { recursive: true });
	await mkdir(join(dir, 'components/layers'), { recursive: true });
	await mkdir(join(dir, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(dir, 'node_modules/@markless', pkg), 'dir');
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ name: 'markless-build-scale', private: true, type: 'module' }, null, '\t'),
	);
	await writeFile(join(dir, 'document.tsrx'), documentSource);
	await writeFile(join(dir, 'components/body-extras.tsrx'), bodyExtrasSource(layers));
	for (let i = 0; i < components; i++)
		await writeFile(join(dir, `components/widget-${i}.tsrx`), componentSource(i));
	for (let i = 0; i < layers; i++)
		await writeFile(join(dir, `components/layers/layer-${i}.tsrx`), layerSource(i, layerBytes));
	await writeFile(
		join(dir, 'pages/index.tsrx'),
		pageSource('home', pick(-1, perPage, components)),
	);
	for (let i = 0; i < pages - 1; i++)
		await writeFile(join(dir, `pages/p${i}.tsrx`), pageSource(i, pick(i, perPage, components)));
	return { dir, pages, components, perPage, layers, layerBytes };
}
