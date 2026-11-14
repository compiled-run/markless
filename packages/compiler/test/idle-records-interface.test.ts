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
