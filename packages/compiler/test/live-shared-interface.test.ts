import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A page's resume module installs the shared() binding from this fact, so it must reach through every module the page composes.

const compile = (filename: string, source: string, imported?: Record<string, unknown>) =>
	compileTsrxModule({
		filename,
		source,
		symbols: [],
		...(imported && { importedModuleInterfaces: imported as never }),
	});

const definitions = (scope: string) => `import { shared, state } from '@markless/core';

export const ui = shared(
	() => {
		const box = state({ open: false });
		return { ...box };
	},
	{ scope: '${scope}' },
);
`;

const reader = `import { ui } from './ui.tsrx';

export function Bar() @{
	const u = ui();
	<button type="button" onClick={() => (u.open = !u.open)}>{u.open ? 'yes' : 'no'}</button>
}

export function Plain() @{
	<b>plain</b>
}
`;

const chain = async (scope: string, tag: string) => {
	const definition = await compile('/w/src/ui.tsrx', definitions(scope));
	const child = await compile('/w/src/bar.tsrx', reader, { './ui.tsrx': definition.moduleGraphInterface });
	const page = await compile(
		'/w/src/page.tsrx',
		`import { ${tag} } from './bar.tsrx';\n\nexport default function Page() @{\n\t<main><${tag} /></main>\n}\n`,
		{ './bar.tsrx': child.moduleGraphInterface },
	);
	const outer = await compile(
		'/w/src/outer.tsrx',
		`import Page from './page.tsrx';\n\nexport default function Outer() @{\n\t<div><Page /></div>\n}\n`,
		{ './page.tsrx': page.moduleGraphInterface },
	);
	return { child, page, outer };
};

test('a page that renders a reader of an app-scoped shared() says so, through every module between', async () => {
	const { child, page, outer } = await chain('app', 'Bar');
	expect(child.moduleGraphInterface.liveShared).toBe(true);
	expect(page.payloadScripts.state.sharedDefinitions ?? []).toEqual([]);
	expect(page.moduleGraphInterface.liveShared).toBe(true);
	expect(outer.moduleGraphInterface.liveShared).toBe(true);
});

test('a container-scoped definition outlives the page too', async () => {
	expect((await chain('container', 'Bar')).page.moduleGraphInterface.liveShared).toBe(true);
});

test('a subtree-scoped definition, or a sibling of the reader, carries no fact', async () => {
	const subtree = await chain('subtree', 'Bar');
	expect(subtree.child.moduleGraphInterface.liveShared).toBeUndefined();
	expect(subtree.page.moduleGraphInterface.liveShared).toBeUndefined();
	const sibling = await chain('app', 'Plain');
	expect(sibling.child.moduleGraphInterface.liveShared).toBe(true);
	expect(sibling.page.moduleGraphInterface.liveShared).toBeUndefined();
});
