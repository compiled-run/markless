import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A collection that is not a reactive graph binding has no graph node for the
// renderer to read rows from, so the server module carries the authored
// expression as a repeatItems callback beside selectBranchArm and renderChild.
test('server emit reads static repeat collections from the module scope they were authored in', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/site-nav.tsrx',
		source: `
import { footerLinks } from './footer-links.ts';

const primaryLinks = [{ href: '/docs', title: 'Docs' }];

export default function SiteNav() @{
	<nav>
		<ul>@for (const link of primaryLinks; key link.href) { <li>{link.title}</li> }</ul>
		<ul>@for (const extra of footerLinks; key extra.href) { <li>{extra.title}</li> }</ul>
	</nav>
}
`,
		environment: 'server',
	});

	expect(result.code).toContain('repeatItems: (marklessSsrDataSlot, marklessSsrDataContext) => {');
	expect(result.code).toContain('case "repeat:0": return primaryLinks;');
	expect(result.code).toContain('case "repeat:1": return footerLinks;');
	expect(result.code).toContain(
		'default: throw new Error("MARKLESS_SSR_DATA_REPEAT_MISSING: " + marklessSsrDataSlot.repeatId);',
	);
	// Both names have to be in the emitted module's own scope for the callback
	// to evaluate: the import line and the module constant travel with it.
	expect(result.code).toContain('import { footerLinks } from "./footer-links.ts";');
	expect(result.code).toContain("const primaryLinks = [{");
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');
	expect(renderData?.source).toContain('"collectionSource":"primaryLinks"');
	expect(renderData?.source).toContain('"collectionSource":"footerLinks"');
});

test('server emit keeps a graph-backed collection on its graph read', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/state-rows.tsrx',
		source: `
import { state } from '@markless/core';

export default function StateRows() @{
	let rows = state([{ id: 'a', label: 'Alpha' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ul>
}
`,
		environment: 'server',
	});

	expect(result.code).not.toContain('repeatItems:');
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');
	expect(renderData?.source).toContain('"collectionGraphNodeId":"state:rows"');
	expect(renderData?.source).not.toContain('"collectionSource"');
});
