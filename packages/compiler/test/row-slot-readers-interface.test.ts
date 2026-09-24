import { expect, test } from 'vitest';
import { compileTsrxModule, importedRowSlotReaders } from '../src/index.ts';

/**
 * A repeat whose rows fill an expression slot is rebuilt through its component's
 * render-data reader, so the page that places that component - however deep the
 * import chain - has to hand its resumed runtime the render-data surface. The
 * module interface is how the page learns it.
 */
const chooserSource = `import { state } from '@markless/core';
export function Chooser() @{
	let picks = state<{ id: string; label: string }[]>([]);
	<ol>@for (const pick of picks; key pick.id) { <li>{\`#\${pick.label}\`}</li> }</ol>
}
`;

test('a component owning an expression-slot repeat says so on its interface', async () => {
	const chooser = await compileTsrxModule({
		filename: 'src/chooser.tsrx',
		source: chooserSource,
		symbols: [],
	});
	expect(chooser.moduleGraphInterface.render.components).toEqual([
		expect.objectContaining({ componentName: 'Chooser', rowSlotReader: true }),
	]);

	const panel = await compileTsrxModule({
		filename: 'src/panel.tsrx',
		source: `import { Chooser } from './chooser.tsrx';
export function Panel() @{
	<section><Chooser /></section>
}
export function Plain() @{
	<p>plain</p>
}
`,
		symbols: [],
		importedModuleInterfaces: { './chooser.tsrx': chooser.moduleGraphInterface },
	});
	const byName = Object.fromEntries(
		panel.moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			component.rowSlotReader,
		]),
	);
	expect(byName).toEqual({ Panel: true, Plain: undefined });
	expect(importedRowSlotReaders({ './panel.tsrx': panel.moduleGraphInterface })).toBe(true);
});

test('an item-only row template leaves the interface as it was', async () => {
	const plain = await compileTsrxModule({
		filename: 'src/plain-rows.tsrx',
		source: chooserSource.replace('{`#${pick.label}`}', '{pick.label}'),
		symbols: [],
	});
	expect(plain.moduleGraphInterface.render.components[0]).not.toHaveProperty('rowSlotReader');
	expect(importedRowSlotReaders({ './plain-rows.tsrx': plain.moduleGraphInterface })).toBe(false);
});
