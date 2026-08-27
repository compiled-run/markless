import { expect, test } from 'vitest';
import {
	marklessNoteWidgetRoot,
	marklessWidgetHandleId,
	type MarklessWidgetRegistry,
} from '../../src/fns/instance-scope.ts';

// A widget-scoped element() handle is one element per RENDERED widget, so its
// registration has to be qualified with the root path of the instance the
// binding part's state read resolved to. These pin the three answers the
// enclosing-family witness reads back through the DOM.

const BAR = 'shared:/src/bar.tsrx#barState';
const ITEM_ELS = `${BAR}/element:itemEls`;

function registryWithTwoBars(extra: ReadonlyArray<readonly [string, string]> = []) {
	const registry: MarklessWidgetRegistry = { rootPaths: new Map(), rowRooted: new Set() };
	marklessNoteWidgetRoot(registry, `c0:${BAR}`, 'c0:');
	marklessNoteWidgetRoot(registry, `c4:${BAR}`, 'c4:');
	for (const [id, rootPath] of extra) marklessNoteWidgetRoot(registry, id, rootPath);
	return registry;
}

test('a part inside a bar qualifies to that bar, not to its own path', () => {
	const registry = registryWithTwoBars();
	expect(marklessWidgetHandleId(ITEM_ELS, 'c0:p1:', registry)).toBe(`c0:${ITEM_ELS}`);
	expect(marklessWidgetHandleId(ITEM_ELS, 'c4:p5:', registry)).toBe(`c4:${ITEM_ELS}`);
});

test('two bars of parts never share a qualified key', () => {
	const registry = registryWithTwoBars();
	expect(marklessWidgetHandleId(ITEM_ELS, 'c0:p1:', registry)).not.toBe(
		marklessWidgetHandleId(ITEM_ELS, 'c4:p5:', registry),
	);
});

test('a part outside every bar qualifies to no bar at all', () => {
	const registry = registryWithTwoBars();
	expect(marklessWidgetHandleId(ITEM_ELS, 'c3:', registry)).toBe(ITEM_ELS);
});

// Why the compiler must not let a part own an imported family's nodes: a part
// registered as a root of the family it merely reads takes its OWN path as the
// answer, and every such part then holds a key no enclosing bar ever asks for.
test('a part wrongly rooted for the family it reads qualifies to itself', () => {
	const registry = registryWithTwoBars([[`c0:p1:${BAR}`, 'c0:p1:']]);
	expect(marklessWidgetHandleId(ITEM_ELS, 'c0:p1:', registry)).toBe(`c0:p1:${ITEM_ELS}`);
});
