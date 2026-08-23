import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// U115 probe, kept as the emission contract for the projected-part bridge: a part
// written into a composing component (`c0:p2:c4:`) reaches the widget root that
// component composed (`c0:c0:`) only if the emitted SSR module carries every link
// of the chain the composition seam reads at render time —
//   1. the rooting component's `marklessWidgetRoots`,
//   2. the SSR component export that publishes it under the name a composing
//      module declares, so `marklessSsrComponentPart` reaches the stamped function,
//   3. `marklessChildrenWidgetRoot` on EVERY same-module component that composes a
//      root around its own children (not only the module root), and
//   4. the composing page handing that child surface and declared name to
//      `marklessSsrChildrenWidgetRoot` in the child literal.
// The fixtures are the real headless checkbox/checklist sources, so the chain is
// pinned on the shape the browser rows exercise rather than a reduction of it.

const componentsRoot = new URL('../../headless/components/src/', import.meta.url);

function read(path: string): string {
	return readFileSync(new URL(path, componentsRoot), 'utf8');
}

const page = `import { ChecklistRoot, ChecklistSelectAll, ChecklistSelectAllIndicator } from './checklist.tsrx';

export default function Page() @{
	<ChecklistRoot values={['lettuce']} data-testid="root">
		<ChecklistSelectAll data-testid="selectall">
			<ChecklistSelectAllIndicator data-testid="indicator">on</ChecklistSelectAllIndicator>
		</ChecklistSelectAll>
	</ChecklistRoot>
}`;

async function compileFamily() {
	const [, checkbox, checklist, consumer] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/base/visually-hidden.tsrx',
			source: read('base/visually-hidden.tsrx'),
			importSource: '../base/visually-hidden.tsrx',
		},
		{
			filename: 'src/checkbox/checkbox.tsrx',
			source: read('checkbox/checkbox.tsrx'),
			importSource: '../checkbox/checkbox.tsrx',
		},
		{
			filename: 'src/checklist/checklist.tsrx',
			source: read('checklist/checklist.tsrx'),
			importSource: './checklist.tsrx',
		},
		{ filename: 'src/checklist/page.tsrx', source: page },
	]);
	return {
		checkbox: checkbox!.publicRenderModule,
		checklist: checklist!.publicRenderModule,
		consumer: consumer!.publicRenderModule,
	};
}

test('the component that roots a widget family is stamped, and published under the name a composing module declares', async () => {
	const { checkbox } = await compileFamily();

	// CheckboxRoot is the checkbox module root, so its SSR function is
	// `marklessRenderSsr` and it carries the family it roots.
	expect(checkbox.ssrModuleSource).toContain(
		'marklessRenderSsr.marklessWidgetRoots = ["shared:src/checkbox/checkbox.tsrx#checkboxState"];',
	);
	// `marklessSsrComponentPart(surface, "CheckboxRoot")` answers with the stamped
	// function rather than the module default, whose `renderSsr` wrapper carries no
	// markers.
	expect(checkbox.ssrComponentExports).toContainEqual({
		exportName: 'CheckboxRoot',
		ssrFunctionName: 'marklessRenderSsr',
	});
});

test('every same-module component that composes a widget root around its own children is stamped, not only the module root', async () => {
	const { checklist } = await compileFamily();
	const source = checklist.ssrModuleSource ?? '';

	// The module root (ChecklistRoot) composes CheckboxRoot at `c0:`.
	expect(source).toMatch(
		/marklessRenderSsr\.marklessChildrenWidgetRoot = marklessSsrWidgetRoots\(\w+,"CheckboxRoot"\)\.length\?"c0:":'';/,
	);
	// A non-root part composes one too, and is stamped on its own function.
	for (const [componentName, declaredName] of [
		['ChecklistItem', 'CheckboxRoot'],
		['ChecklistSelectAll', 'CheckboxTrigger'],
		['ChecklistItemLabel', 'CheckboxLabel'],
	] as const)
		expect(source).toMatch(
			new RegExp(
				`marklessRenderSsr${componentName}\\.marklessChildrenWidgetRoot = marklessSsrWidgetRoots\\(\\w+,"${declaredName}"\\)\\.length\\?"c\\d+:":'';`,
			),
		);
	// A non-root part that composes a ROOT is itself a root of that family, so it
	// carries `marklessWidgetRoots` as well.
	expect(source).toMatch(
		/marklessRenderSsrChecklistItem\.marklessWidgetRoots = \[\.\.\.marklessSsrWidgetRoots\(\w+,"CheckboxRoot"\)\];/,
	);
	expect(checklist.ssrComponentExports).toContainEqual({
		exportName: 'ChecklistItem',
		ssrFunctionName: 'marklessRenderSsrChecklistItem',
	});
});

test('a composing page hands the projecting child surface and its declared name to the children-widget-root lookup', async () => {
	const { consumer } = await compileFamily();
	const source = consumer.ssrModuleSource ?? '';

	// The child literal carries the declared children-widget-root, which is what
	// composition turns into the projected part's `projectionIds`.
	expect(source).toMatch(
		/childrenWidgetRoot:marklessSsrChildrenWidgetRoot\(\w+,"ChecklistRoot"\)/,
	);
	// The seed pass registers the widget instance token from the same answer.
	expect(source).toMatch(
		/marklessSsrSeeds\.set\("markless:widget-instance",marklessSsrIdPrefix\+"c0:"\+marklessSsrChildrenWidgetRoot\(\w+,"ChecklistRoot"\)\)/,
	);
});
