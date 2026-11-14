import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A page's resume module installs the idle queue from this fact, so it must reach through every module the page composes.

const compile = (filename: string, source: string, imported?: Record<string, unknown>) =>
	compileTsrxModule({
		filename,
		source,
		symbols: [],
		...(imported && { importedModuleInterfaces: imported as never }),
	});

const armChild = `import { computed } from '@markless/core';

export function Ticker() @{
	const user = computed(async () => ({ text: 'x' }));

	<section>
		@try {
			<output onIdle={() => {}}>{user.text}</output>
		} @pending {
			<p>Loading</p>
		}
	</section>
}
`;

const page = (tag: string) => `import { ${tag} } from './child.tsrx';

export default function Page() @{
	<main><${tag} /></main>
}
`;

test('a module whose only idle record is in a streamed @try arm says so', async () => {
	const child = await compile('/w/src/child.tsrx', armChild);
	expect(child.moduleGraphInterface.idleRecords).toBe(true);
});

test('a page composing that module says so through the module interface it imports', async () => {
	const child = await compile('/w/src/child.tsrx', armChild);
	const parent = await compile('/w/src/page.tsrx', page('Ticker'), {
		'./child.tsrx': child.moduleGraphInterface,
	});
	expect(parent.moduleGraphInterface.idleRecords).toBe(true);
	const grand = await compile(
		'/w/src/outer.tsrx',
		`import Page from './page.tsrx';\n\nexport default function Outer() @{\n\t<div><Page /></div>\n}\n`,
		{ './page.tsrx': parent.moduleGraphInterface },
	);
	expect(grand.moduleGraphInterface.idleRecords).toBe(true);
});

test('a page with no idle record anywhere carries no fact', async () => {
	const child = await compile(
		'/w/src/child.tsrx',
		`export function Plain() @{\n\t<button type="button" onClick={() => {}}>x</button>\n}\n`,
	);
	const parent = await compile('/w/src/page.tsrx', page('Plain'), {
		'./child.tsrx': child.moduleGraphInterface,
	});
	expect(child.moduleGraphInterface.idleRecords).toBeUndefined();
	expect(parent.moduleGraphInterface.idleRecords).toBeUndefined();
});

test('a page rendering only a sibling of the idle component carries no fact', async () => {
	const child = await compile(
		'/w/src/child.tsrx',
		`${armChild}
export function Plain() @{
	<button type="button" onClick={() => {}}>x</button>
}
`,
	);
	const parent = await compile('/w/src/page.tsrx', page('Plain'), {
		'./child.tsrx': child.moduleGraphInterface,
	});
	expect(child.moduleGraphInterface.idleRecords).toBe(true);
	expect(parent.moduleGraphInterface.idleRecords).toBeUndefined();
});

const tickerModule = `export function Ticker() @{
	<output onIdle={() => {}}>tick</output>
}

export function Plain() @{
	<b>plain</b>
}

export default function Main() @{
	<p onIdle={() => {}}>main</p>
}
`;

const pageWith = async (imports: string, tags: string) => {
	const child = await compile('/w/src/child.tsrx', tickerModule);
	return (
		await compile(
			'/w/src/page.tsrx',
			`${imports}\n\nexport default function Page() @{\n\t<main>${tags}</main>\n}\n`,
			{ './child.tsrx': child.moduleGraphInterface },
		)
	).moduleGraphInterface.idleRecords;
};

test('the fact follows an aliased, a default and a namespace import of the idle component', async () => {
	expect(await pageWith(`import { Ticker as T } from './child.tsrx';`, '<T />')).toBe(true);
	expect(await pageWith(`import Child from './child.tsrx';`, '<Child />')).toBe(true);
	expect(await pageWith(`import * as kit from './child.tsrx';`, '<kit.Ticker />')).toBe(true);
	expect(await pageWith(`import { Plain as Ticker } from './child.tsrx';`, '<Ticker />')).toBeUndefined();
});

// Open: a component handed over as a prop value renders through no edge, so its idle record is not seen.
test.fails('the fact follows a component passed as a prop value', async () => {
	const frame = await compile(
		'/w/src/frame.tsrx',
		`export function Frame({ Body }) @{\n\t<section><Body /></section>\n}\n`,
	);
	const child = await compile('/w/src/child.tsrx', tickerModule);
	const page = await compile(
		'/w/src/page.tsrx',
		`import { Frame } from './frame.tsrx';\nimport { Ticker } from './child.tsrx';\n\nexport default function Page() @{\n\t<main><Frame Body={Ticker} /></main>\n}\n`,
		{ './frame.tsrx': frame.moduleGraphInterface, './child.tsrx': child.moduleGraphInterface },
	);
	expect(page.moduleGraphInterface.idleRecords).toBe(true);
});
