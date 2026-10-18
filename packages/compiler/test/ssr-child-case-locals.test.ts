import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The emitted child render evaluates the authored prop expressions inside its own
// block, so any local it declares there shadows a row binding of the same name.
async function childCase(itemName: string, componentName: string, tag: string) {
	const source = `
import { state } from '@markless/core';

function ${componentName}({ entry }) @{
	<${tag} data-entry={entry.id}>{entry.label}</${tag}>
}

export function App() @{
	let entries = state([{ id: 'a', label: 'A' }]);

	<section>
		@for (const ${itemName} of entries; key ${itemName}.id) {
			<${componentName} entry={${itemName}} />
		}
	</section>
}
`;
	const result = await compileTsrxModule({ filename: 'src/App.tsrx', source, symbols: [] });
	const emitted = result.publicRenderModule.ssrModuleSource ?? '';
	const start = emitted.indexOf('case "component-edge:0":{');
	expect(start).toBeGreaterThan(-1);
	return emitted.slice(start, emitted.indexOf('return marklessSsrChildOutput;}', start));
}

for (const [itemName, componentName, tag] of [
	['child', 'Leaf', 'li'],
	['childProps', 'Chip', 'b'],
	['output', 'Cell', 'td'],
] as const)
	test(`a row bound as \`${itemName}\` hands its item, not an emitted local, to the child`, async () => {
		const block = await childCase(itemName, componentName, tag);
		expect(block).toContain(`entry:(${itemName})`);
		const declared = [...block.matchAll(/\bconst ([A-Za-z_$][\w$]*)=/g)].map(
			(match) => match[1],
		);
		expect(declared.length).toBeGreaterThan(0);
		expect(declared).not.toContain(itemName);
		for (const name of declared) expect(name).toMatch(/^markless/);
	});
