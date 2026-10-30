import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearCompileCache, useCompileRunner } from '@markless/compiler';
import { rolldown } from 'rolldown';
import { afterEach, expect, test } from 'vitest';
import { marklessServer } from '../src/rolldown.ts';
import { throwIfLinkPending, transformTsrxModule } from '../src/transform.ts';

afterEach(() => {
	useCompileRunner(undefined);
	clearCompileCache();
});

const CARD = `export default function Card() @{
	<figure><figcaption>caption</figcaption></figure>
}`;

// A @for at the root renders a count only the page render knows.
const LIST = `export default function Card() @{
	<>
		<p>head</p>
		@for (const id of [1, 2]; key id) { <p>{id}</p> }
	</>
}`;

// Each button sits between two Cards: its address in the arm is known only once Card's size is.
const PAGE = `import { state } from '@markless/core';
import Card from './Card.tsrx';
const SHOWN = true;
export default function Page() @{
	let tab = state('a');
	<main>
		@if (SHOWN) {
			<article>
				<Card />
				<div><button onClick={() => (tab = 'b')}>{tab}</button></div>
				<Card />
			</article>
		}
	</main>
}`;

async function buildPage(
	card: string,
	page = PAGE,
	extraFiles: Readonly<Record<string, string>> = {},
) {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'markless-first-pass-')));
	const compiles: Array<{ readonly linked: boolean }> = [];
	useCompileRunner((input) => {
		if (input.filename.endsWith('Page.tsrx'))
			compiles.push({ linked: input.importedModuleInterfaces !== undefined });
		return undefined;
	});
	try {
		await writeFile(join(directory, 'Card.tsrx'), card);
		await writeFile(join(directory, 'Page.tsrx'), page);
		for (const [name, text] of Object.entries(extraFiles))
			await writeFile(join(directory, name), text);
		await writeFile(join(directory, 'entry.js'), `export { default } from './Page.tsrx';\n`);
		const build = await rolldown({
			input: join(directory, 'entry.js'),
			external: [/^@markless\//],
			plugins: [marklessServer({ rootDir: directory })],
		});
		try {
			await build.generate({ format: 'es' });
		} finally {
			await build.close();
		}
		return compiles;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test('a page whose element addresses need an imported component compiles unlinked once, without a failed attempt', async () => {
	const compiles = await buildPage(CARD);
	expect(compiles.filter((compile) => !compile.linked)).toHaveLength(1);
});

test('an element no imported size can address still fails the build', async () => {
	await expect(buildPage(LIST)).rejects.toThrow(/MARKLESS_ELEMENT_UNADDRESSABLE/);
});

test('an element beside a component the build never links still fails the build', async () => {
	await expect(
		buildPage(CARD, PAGE.replace("from './Card.tsrx'", "from '@markless/external-card'")),
	).rejects.toThrow(/MARKLESS_ELEMENT_UNADDRESSABLE/);
});

test('a refusal held for the link throws if nothing linked replaces the compile', async () => {
	const input = { filename: '/app/Page.tsrx', source: PAGE, linkPending: true };
	const unlinked = await transformTsrxModule(input);
	expect(unlinked.linkPendingDiagnostics?.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_ELEMENT_UNADDRESSABLE',
	]);
	expect(() => throwIfLinkPending(input, unlinked)).toThrow(/MARKLESS_ELEMENT_UNADDRESSABLE/);
	await expect(transformTsrxModule({ ...input, linkPending: false })).rejects.toThrow(
		/MARKLESS_ELEMENT_UNADDRESSABLE/,
	);
});

test('a page importing one component directly and another through a barrel still links the direct one', async () => {
	const page = PAGE.replace(
		"import Card from './Card.tsrx';",
		"import Card from './Card.tsrx';\nimport { Badge } from './parts.ts';",
	).replace('<main>', '<main>\n\t\t<Badge />');
	await buildPage(CARD, page, {
		'Badge.tsrx': `export default function Badge() @{\n\t<span>new</span>\n}`,
		'parts.ts': `export { default as Badge } from './Badge.tsrx';\n`,
	});
});
