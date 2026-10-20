import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');

const files: Record<string, string> = {
	'document.tsrx': `import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import Banner from './src/banner.tsrx';
import HeadTags from './src/head-tags.tsrx';

const slots: Record<string, readonly string[]> = { '/': ['home', 'start'], '/guide': ['guide'] };

export default function Document({ children, url }: { readonly children?: Children; readonly url: URL }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			@for (const slot of slots[url.pathname] ?? []; key slot) {
				<HeadTags name={slot} />
			}
		</head>
		<body>
			<Banner label="shell" />
			@if (url.pathname === '/guide') {
				<Banner label="guide only" />
			} @else {
				<p data-not-guide>elsewhere</p>
			}
			@switch (url.pathname) {
				@case '/guide': {
					<p data-section>guide section</p>
				}
				@default: {
					<p data-section>home section</p>
				}
			}
			{children}
		</body>
	</Html>
}
`,
	'src/banner.tsrx': `export default function Banner({ label }: { readonly label: string }) @{
	<div data-banner>{label}</div>
}
`,
	'src/head-tags.tsrx': `export default function HeadTags({ name }: { readonly name: string }) @{
	<meta name="slot" content={name} />
}
`,
	'pages/index.tsrx': `export default function Home() @{
	<main>home page</main>
}
`,
	'pages/guide.tsrx': `export default function Guide() @{
	<main>guide page</main>
}
`,
};

let root = '';
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-router-document-components-'));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (const [file, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	server?.close();
	await rm(root, { recursive: true, force: true });
});

test('document.tsrx renders child components and @for, @if and @switch on the request URL', async () => {
	const page = async (path: string) => (await fetch(new URL(path, server!.origin))).text();
	const home = await page('/');
	expect(home.match(/<meta name="slot" content="[^"]*"/g)).toEqual([
		'<meta name="slot" content="home"',
		'<meta name="slot" content="start"',
	]);
	expect(home.match(/<div data-banner="">[^<]*<\/div>/g)).toEqual([
		'<div data-banner="">shell</div>',
	]);
	expect(home).toContain('<p data-not-guide="">elsewhere</p>');
	expect(home).toContain('<p data-section="">home section</p>');
	expect(home).toContain('home page');

	const guide = await page('/guide');
	expect(guide.match(/<meta name="slot" content="[^"]*"/g)).toEqual([
		'<meta name="slot" content="guide"',
	]);
	expect(guide.match(/<div data-banner="">[^<]*<\/div>/g)).toEqual([
		'<div data-banner="">shell</div>',
		'<div data-banner="">guide only</div>',
	]);
	expect(guide).not.toContain('data-not-guide');
	expect(guide).toContain('<p data-section="">guide section</p>');
	expect(guide).toContain('guide page');
});

test('a handler written on the document stops the build instead of being dropped', async () => {
	const app = await mkdtemp(join(tmpdir(), 'markless-router-document-handler-'));
	try {
		await mkdir(join(app, 'node_modules/@markless'), { recursive: true });
		for (const name of ['core', 'router'])
			await symlink(join(packagesRoot, name), join(app, 'node_modules/@markless', name), 'dir');
		await mkdir(join(app, 'pages'));
		await writeFile(
			join(app, 'document.tsrx'),
			`import type { Children } from '@markless/core';
import { Html } from '@markless/router';
export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head><meta charset="utf-8" /></head>
		<body onClick={(event) => (event.target as HTMLElement).setAttribute('data-clicked', 'yes')}>{children}</body>
	</Html>
}
`,
		);
		await writeFile(
			join(app, 'pages/index.tsrx'),
			`export default function Page() @{\n\t<main><button id="b">press</button></main>\n}\n`,
		);
		const builder = await createBuilder({
			root: app,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await expect(builder.buildApp()).rejects.toThrow(
			/MARKLESS_ROUTER_DOCUMENT_HANDLERS_UNSUPPORTED: .*document\.tsrx sets onClick on <body>/,
		);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
