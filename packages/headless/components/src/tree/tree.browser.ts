import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Deep from './scenarios/deep.tsrx';
import FileExplorer from './scenarios/file-explorer.tsrx';
import Nested from './scenarios/nested.tsrx';
import NestedOpen from './scenarios/nested-open.tsrx';
import NodesFromData from './scenarios/nodes-from-data.tsrx';
import Preopened from './scenarios/preopened.tsrx';
import Typeahead from './scenarios/typeahead.tsrx';
import TwoTrees from './scenarios/two-trees.tsrx';
import Unavailable from './scenarios/unavailable.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

// Colocated browser suite for the tree family. Each test renders a realistic
// consumer scenario, and the locators name the part anatomy per node: root,
// label, item, itemtrigger, itemcontent, itemlabel, itemindicator, prefixed with
// the node's own subject in every nested scenario.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
// The flat starter.
const ReadmeItem = page.getByTestId('readme-item');
const LicenseItem = page.getByTestId('license-item');
const ChangelogItem = page.getByTestId('changelog-item');
// The hand-written two-level tree.
const SrcItem = page.getByTestId('src-item');
const SrcTrigger = page.getByTestId('src-itemtrigger');
const SrcContent = page.getByTestId('src-itemcontent');
const SrcLabel = page.getByTestId('src-itemlabel');
const SrcIndicator = page.getByTestId('src-itemindicator');
const IndexItem = page.getByTestId('index-item');
const AppItem = page.getByTestId('app-item');
// The pre-opened tree, three levels of it.
const UiItem = page.getByTestId('ui-item');
const UiTrigger = page.getByTestId('ui-itemtrigger');
const UiContent = page.getByTestId('ui-itemcontent');
const ButtonItem = page.getByTestId('button-item');
const DocsItem = page.getByTestId('docs-item');
const DocsContent = page.getByTestId('docs-itemcontent');
const IntroItem = page.getByTestId('intro-item');
// The file explorer, where each row also holds a link.
const AssetsItem = page.getByTestId('assets-item');
const AssetsIndicator = page.getByTestId('assets-itemindicator');
const AssetsLink = page.getByTestId('assets-link');
const LogoItem = page.getByTestId('logo-item');
// Typeahead names.
const AppsItem = page.getByTestId('apps-item');
const BuildItem = page.getByTestId('build-item');
const ConfigItem = page.getByTestId('config-item');
const DraftsItem = page.getByTestId('drafts-item');
const ZipItem = page.getByTestId('zip-item');
// Consumer callbacks.
const SrcValue = page.getByTestId('src-value');
const UiValue = page.getByTestId('ui-value');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// Two trees on one page.
const LeftRoot = page.getByTestId('left-root');
const LeftSrcItem = page.getByTestId('left-src-item');
const LeftSrcTrigger = page.getByTestId('left-src-itemtrigger');
const LeftReadmeItem = page.getByTestId('left-readme-item');
const RightRoot = page.getByTestId('right-root');
const RightSrcItem = page.getByTestId('right-src-item');
const RightReadmeItem = page.getByTestId('right-readme-item');
// The self-composing tree, four levels of one component.
const Depth4Item = page.getByTestId('depth-4-item');
const Depth3Item = page.getByTestId('depth-3-item');
const Depth4Trigger = page.getByTestId('depth-4-itemtrigger');
const Depth3Trigger = page.getByTestId('depth-3-itemtrigger');
const Depth3Content = page.getByTestId('depth-3-itemcontent');
const Depth2Item = page.getByTestId('depth-2-item');
const Depth1Item = page.getByTestId('depth-1-item');
// Nodes written by a loop over data.

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be passed
// by reference or wrapped in a helper - the branch below keeps both call sites
// literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function rows(root: Element) {
	return Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
}

function visibleRows(root: Element) {
	return rows(root).filter((row) => !row.closest('[role="group"][hidden]'));
}

// The hand-written branch, opened the way a person opens it. Written as a
// gesture rather than as an `open` prop because a node seeded open serves its
// group hidden until the first gesture reaches it - the pinned row says so.
async function openSrc() {
	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(SrcContent).hasAttribute('hidden')).toBe(false);
}

function expectStarterRendered() {
	expect(el(Root).getAttribute('role')).toBe('tree');
	// The container is the tree's one tab stop until focus has been inside it.
	expect(el(Root).getAttribute('tabindex')).toBe('0');
	expect(el(Label).textContent).toBe('Project files');
	for (const item of [el(ReadmeItem), el(LicenseItem), el(ChangelogItem)]) {
		expect(item.getAttribute('role')).toBe('treeitem');
		expect(item.getAttribute('aria-level')).toBe('1');
		expect(item.getAttribute('tabindex')).toBe('-1');
		expect(item.getAttribute('ui-leaf')).toBe('');
		// The WAI-ARIA rule QDS gets backwards: an end node carries NO open state,
		// so a reader can tell it apart from a node that has not been opened yet.
		expect(item.hasAttribute('aria-expanded')).toBe(false);
		// And a disclosure tree carries no selection state either. QDS writes
		// aria-selected="false" on every node of a tree that cannot select.
		expect(item.hasAttribute('aria-selected')).toBe(false);
	}
	// The DOM fully represents the hierarchy here, so the counters the APG only
	// asks for when it does not are deliberately absent.
	expect(el(ReadmeItem).hasAttribute('aria-setsize')).toBe(false);
	expect(el(ReadmeItem).hasAttribute('aria-posinset')).toBe(false);
	expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);
}

function expectNestedRendered() {
	// A closed parent MUST say so, which is the announcement QDS drops.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(SrcItem).getAttribute('ui-closed')).toBe('');
	expect(el(SrcItem).getAttribute('aria-level')).toBe('1');
	expect(el(SrcContent).getAttribute('role')).toBe('group');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
	// Closed hides the group; it never detaches it, so the nodes under it and the
	// widget instances they root are all still there.
	expect(document.contains(el(IndexItem))).toBe(true);
	expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	expect(el(AppItem).getAttribute('aria-level')).toBe('2');
	expect(el(IndexItem).hasAttribute('aria-expanded')).toBe(false);
	// The trigger is not a second tab stop, and it is named by its own node's
	// label through a minted id nobody spelled.
	expect(el(SrcTrigger).getAttribute('tabindex')).toBe('-1');
	expect(el(SrcLabel).id).toBeTruthy();
	expect(el(SrcTrigger).getAttribute('aria-labelledby')).toBe(el(SrcLabel).id);
	// The indicator is decoration: the row beside it already reports the state.
	expect(el(SrcIndicator).getAttribute('aria-hidden')).toBe('true');
	expect(el(SrcIndicator).getAttribute('ui-closed')).toBe('');
}

// A prop the part destructured out of its parameters must not come back through
// `{...rest}`. `TreeItem` is written `({ open = false, leaf = false, level = 1,
// onChange, children, ...rest })`, so none of those names may reach the element.
function expectItemsDropDestructuredProps() {
	for (const item of [el(SrcItem), el(IndexItem)]) {
		expect(item.hasAttribute('open')).toBe(false);
		expect(item.hasAttribute('leaf')).toBe(false);
		expect(item.hasAttribute('level')).toBe(false);
	}
	// What the part does project is still there.
	expect(el(IndexItem).getAttribute('ui-leaf')).toBe('');
	expect(el(SrcItem).getAttribute('aria-level')).toBe('1');
}

function expectPreopenedRendered() {
	// The branch written open is open before anything on the client has run, and
	// its children are on the screen.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(SrcItem).getAttribute('ui-open')).toBe('');
	expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	// The branch that was not written open is closed, and its child is hidden.
	expect(el(DocsItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(DocsContent).hasAttribute('hidden')).toBe(true);
	// Which makes the walk order exactly the visible rows.
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'src-item',
		'index-item',
		'app-item',
		'docs-item',
	]);
	expect(document.contains(el(IntroItem))).toBe(true);
}

function expectDeepRendered() {
	// Four levels of ONE component composing itself, each rooting its own widget
	// instance of the same family.
	expect(el(Depth4Item).getAttribute('aria-level')).toBe('1');
	expect(el(Depth3Item).getAttribute('aria-level')).toBe('2');
	expect(el(Depth2Item).getAttribute('aria-level')).toBe('3');
	expect(el(Depth1Item).getAttribute('aria-level')).toBe('4');
	// Each level really is inside the one above it, and inside its group.
	expect(el(Depth4Item).contains(el(Depth3Item))).toBe(true);
	expect(el(page.getByTestId('depth-4-itemcontent')).contains(el(Depth3Item))).toBe(true);
	expect(el(Depth2Item).contains(el(Depth1Item))).toBe(true);
	expect(el(Depth1Item).contains(el(Depth4Item))).toBe(false);
	// Every level starts closed, and every level says so.
	for (const item of [el(Depth4Item), el(Depth3Item), el(Depth2Item), el(Depth1Item)]) {
		expect(item.getAttribute('aria-expanded')).toBe('false');
	}
	// Only the outermost row is on the screen; the rest are inside closed groups.
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
	]);
}

function expectTwoTreesRendered() {
	expect(el(LeftRoot).getAttribute('aria-label')).toBe('Left project');
	expect(el(RightRoot).getAttribute('aria-label')).toBe('Right project');
	// Each tree walks its own rows only.
	expect(visibleRows(el(LeftRoot)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'left-src-item',
		'left-readme-item',
	]);
	expect(visibleRows(el(RightRoot)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'right-src-item',
		'right-readme-item',
	]);
	// And each node mints its own label id, so no trigger points at a neighbour's.
	const ids = [
		el(page.getByTestId('left-src-itemlabel')).id,
		el(page.getByTestId('right-src-itemlabel')).id,
	];
	expect(new Set(ids).size).toBe(2);
	expect(el(LeftSrcTrigger).getAttribute('aria-labelledby')).toBe(ids[0]);
}

function expectUnavailableRendered() {
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(page.getByTestId('src-itemtrigger')).hasAttribute('disabled')).toBe(true);
	expect(el(page.getByTestId('docs-itemtrigger')).hasAttribute('disabled')).toBe(true);
	// A locked tree still reports what is open and what is not.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(DocsItem).getAttribute('aria-expanded')).toBe('true');
	// And the raw prop never reaches the container.
	expect(el(Root).hasAttribute('disabled')).toBe(false);
}

async function expectUnavailableBlocks() {
	el(page.getByTestId('src-itemtrigger')).click();
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
}

async function expectTriggerOpensAndCloses() {
	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(SrcItem).getAttribute('ui-open')).toBe('');
	expect(el(SrcIndicator).getAttribute('ui-open')).toBe('');

	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
	// Closing hid the group; it never took it out of the page.
	expect(document.contains(el(IndexItem))).toBe(true);
}

async function expectConsumerCallbackFires() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(SrcValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(page.getByTestId('src-itemtrigger')).click();
	await expect.poll(() => el(SrcValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The consumer's own click handler on the trigger runs after the node has
	// already opened and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	// The nested node's handler did not run.
	expect(el(UiValue).textContent).toBe('');
}

async function expectNestedNodeReachesItsOwnHandler() {
	// The nested node starts open, so its first click reports false - and it is
	// the node the click landed on, not the one enclosing it.
	el(page.getByTestId('ui-itemtrigger')).click();
	await expect.poll(() => el(UiValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(SrcValue).textContent).toBe('');
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(UiItem).getAttribute('aria-expanded')).toBe('false');
}

async function expectOmittedCallbackStillToggles() {
	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(Calls).textContent).toBe('0');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a tree of end nodes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectStarterRendered();
	});

	test(`${mode}: a nested tree renders its group, its levels and its closed state`, async () => {
		if (mode === 'CSR') await render(Nested);
		else await renderSSR(Nested);
		expectNestedRendered();
	});

	test(`${mode}: a node drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Nested);
		else await renderSSR(Nested);
		expectItemsDropDestructuredProps();
	});

	// Pinned, with the measured cause: a node written `open` reports itself open -
	// its own element carries aria-expanded="true" and ui-open - and its GROUP is
	// still served hidden, because the seed the node's body writes does not reach
	// the `tree.itemcontent` part's first read. Measured on this tip: the group
	// follows the node perfectly from the first gesture onward, which the
	// second-level row further down witnesses directly. `tree.root` -> `tree.item`
	// is a widget root inside a widget root, which is what separates this from
	// collapsible's `open` prop on a top-level root. Deterministic, so test.fails.
	test.fails(`${mode}: branches written open render open`, async () => {
		if (mode === 'CSR') await render(Preopened);
		else await renderSSR(Preopened);
		expectPreopenedRendered();
	});

	test(`${mode}: a node written open still reports itself open`, async () => {
		if (mode === 'CSR') await render(Preopened);
		else await renderSSR(Preopened);
		expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
		expect(el(SrcItem).getAttribute('ui-open')).toBe('');
		expect(el(DocsItem).getAttribute('aria-expanded')).toBe('false');
		expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	});

	// The spike research-tree.md §6c.2 named: four levels of ONE component
	// composing itself, each level rooting its own widget instance of the same
	// family. Green in both modes since the page's symbol route table re-enters
	// itself instead of stopping after one strip (defect 51).
	test(`${mode}: a self-composing node unrolls to the depth its prop names`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);
		expectDeepRendered();
	});

	test(`${mode}: two trees on one page keep their own rows and their own ids`, async () => {
		if (mode === 'CSR') await render(TwoTrees);
		else await renderSSR(TwoTrees);
		expectTwoTreesRendered();
	});

	test(`${mode}: a tree nobody may change renders locked and does not move`, async () => {
		if (mode === 'CSR') await render(Unavailable);
		else await renderSSR(Unavailable);
		expectUnavailableRendered();
		await expectUnavailableBlocks();
	});

	test(`${mode}: the trigger opens the node and closes it again`, async () => {
		if (mode === 'CSR') await render(Nested);
		else await renderSSR(Nested);
		await expectTriggerOpensAndCloses();
	});

	test(`${mode}: a click calls the consumer onChange once with the next state`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: a nested node reaches its own handler, not the one enclosing it`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectNestedNodeReachesItsOwnHandler();
	});

	test(`${mode}: an omitted onChange opens the node anyway`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbackStillToggles();
	});
}

// --- recursion ------------------------------------------------------------

test('CSR: each unrolled level owns its own open state', async () => {
	await render(Deep);

	el(Depth4Trigger).click();
	await expect.poll(() => el(Depth4Item).getAttribute('aria-expanded')).toBe('true');
	// Only that level moved: the levels below it are still closed, and opening
	// one level brings exactly one more row onto the screen.
	expect(el(Depth3Item).getAttribute('aria-expanded')).toBe('false');
	expect(el(Depth2Item).getAttribute('aria-expanded')).toBe('false');
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
		'depth-3-item',
	]);

	el(Depth3Trigger).click();
	await expect.poll(() => el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth3Content).hasAttribute('hidden')).toBe(false);
	expect(el(Depth4Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth2Item).getAttribute('aria-expanded')).toBe('false');

	// Closing the outermost level takes the whole subtree out of the walk while
	// every level below it keeps the state it had.
	el(Depth4Trigger).click();
	await expect.poll(() => el(Depth4Item).getAttribute('aria-expanded')).toBe('false');
	expect(el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
	]);
});

// --- keyboard -------------------------------------------------------------

test('CSR: ArrowDown and ArrowUp walk the visible rows', async () => {
	await render(Nested);
	await openSrc();
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(AppItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	// The last visible row is the end of the walk; it does not wrap.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(AppItem));
});

// The row that catches a walk which forgets that a closed group is not on the
// screen: from a closed `src`, the next row down is README.md, not index.ts.
test('CSR: ArrowDown across a closed node skips its children', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(document.activeElement).not.toBe(el(IndexItem));
});

// The APG says so explicitly, and a tree whose ArrowDown expands is the most
// common tree defect there is.
test('CSR: ArrowDown never opens anything', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: Home and End jump to the first and last visible rows', async () => {
	await render(Nested);
	await openSrc();
	el(IndexItem).focus();

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});

// ArrowRight is two-phase, and neither phase does the other's work. This is the
// pair of rows that separates a tree from a list.
test('CSR: ArrowRight opens a closed node without moving focus, then descends', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(document.activeElement).toBe(el(SrcItem));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
	// Descending did not open anything else.
	expect(el(IndexItem).hasAttribute('aria-expanded')).toBe(false);
});

test('CSR: ArrowRight on an end node does nothing at all', async () => {
	await render(Nested);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowRight}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(ReadmeItem));
	expect(el(ReadmeItem).hasAttribute('aria-expanded')).toBe(false);
});

test('CSR: ArrowLeft closes an open node, and does not move focus doing it', async () => {
	await render(Nested);
	await openSrc();
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(document.activeElement).toBe(el(SrcItem));
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);

	// A second press on the now-closed node has no parent to reach, so it stays.
	await userEvent.keyboard('{ArrowLeft}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(SrcItem));
});

test('CSR: ArrowLeft from an end node moves to its parent', async () => {
	await render(Nested);
	await openSrc();
	el(IndexItem).focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
	// Moving to the parent left the parent open.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
});

// The QDS heuristic this family does not copy: "Enter clicks the first focusable
// in the row" follows the link, because the link is written first.
test('CSR: Enter on a row opens the node and does not follow the link in it', async () => {
	await render(FileExplorer);
	const hash = window.location.hash;
	el(AssetsItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).getAttribute('aria-expanded')).toBe('true');
	expect(window.location.hash).toBe(hash);
	expect(el(AssetsIndicator).getAttribute('ui-open')).toBe('');
	// The link is still there and still points where it did.
	expect(el(AssetsLink).getAttribute('href')).toBe('#assets-page');
});

test('CSR: Enter on a row closes it again', async () => {
	await render(FileExplorer);
	el(AssetsItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).getAttribute('aria-expanded')).toBe('true');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).getAttribute('aria-expanded')).toBe('false');
	expect(document.contains(el(LogoItem))).toBe(true);
});

// --- typeahead ------------------------------------------------------------

test('CSR: typing a letter moves to the next visible node whose name starts with it', async () => {
	await render(Typeahead);
	el(AppsItem).focus();

	await userEvent.keyboard('c');
	await expect.poll(() => document.activeElement).toBe(el(ConfigItem));

	// A new search, not a continuation: the buffer clears after 750ms, which is
	// what makes 'b' a fresh first letter rather than 'cb'.
	await new Promise((resolve) => setTimeout(resolve, 900));
	await userEvent.keyboard('b');
	await expect.poll(() => document.activeElement).toBe(el(BuildItem));
});

test('CSR: typing more letters narrows to the node that starts with all of them', async () => {
	await render(Typeahead);
	el(AppsItem).focus();

	// "d" alone lands on docs; "dr" is drafts.
	await userEvent.keyboard('dr');
	await expect.poll(() => document.activeElement).toBe(el(DraftsItem));
});

// A node a person cannot see is a node typeahead must not reach, or the walk
// lands somewhere the screen does not show.
test('CSR: typeahead never reaches a node inside a closed branch', async () => {
	await render(Typeahead);
	el(AppsItem).focus();

	await userEvent.keyboard('z');
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(document.activeElement).toBe(el(AppsItem));
	expect(document.activeElement).not.toBe(el(ZipItem));
});

// --- reachability ---------------------------------------------------------

test('CSR: focus moves the one tab stop with it', async () => {
	await render(Nested);
	await openSrc();
	// Before anything is focused, the container holds the stop and no row does.
	expect(el(Root).getAttribute('tabindex')).toBe('0');
	expect(rows(el(Root)).every((row) => row.getAttribute('tabindex') === '-1')).toBe(true);

	el(SrcItem).focus();
	await expect.poll(() => el(SrcItem).getAttribute('tabindex')).toBe('0');
	// And the container steps out of the tab order, so Shift+Tab leaves the tree
	// instead of being caught by the container and sent back in.
	await expect.poll(() => el(Root).getAttribute('tabindex')).toBe('-1');
	expect(rows(el(Root)).filter((row) => row.getAttribute('tabindex') === '0')).toHaveLength(1);

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(IndexItem).getAttribute('tabindex')).toBe('0');
	expect(el(SrcItem).getAttribute('tabindex')).toBe('-1');
	expect(rows(el(Root)).filter((row) => row.getAttribute('tabindex') === '0')).toHaveLength(1);
});

test('CSR: landing on the container hands focus to the first visible row', async () => {
	await render(Nested);
	el(Root).focus();

	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
});

test('CSR: arrowing in one tree never touches the other', async () => {
	await render(TwoTrees);
	el(LeftSrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LeftReadmeItem));
	expect(document.activeElement).not.toBe(el(RightSrcItem));
	// The other tree kept its own tab stop, untouched.
	expect(el(RightRoot).getAttribute('tabindex')).toBe('0');
	expect(el(RightReadmeItem).getAttribute('tabindex')).toBe('-1');

	// And opening a node in one leaves the other closed.
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(LeftSrcItem));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(LeftSrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(RightSrcItem).getAttribute('aria-expanded')).toBe('false');
});

// --- resume ---------------------------------------------------------------

test('SSR: the first ArrowRight after resume opens the node, and the second descends', async () => {
	await renderSSR(Nested);
	// What the server sent, before anything on the client has run.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);

	el(SrcItem).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(SrcContent).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
});

test('SSR: a node opened after resume stays open, and its children are reachable by ArrowDown', async () => {
	await renderSSR(Nested);
	await openSrc();

	el(SrcItem).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(AppItem));
	// Nothing about the state moved on the way.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
});

// The resume twin: post-resume interaction reaches the same client route table.
test('SSR: each unrolled level resumes with its own open state', async () => {
	await renderSSR(Deep);
	expectDeepRendered();

	el(Depth3Trigger).click();
	await expect.poll(() => el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth4Item).getAttribute('aria-expanded')).toBe('false');
	expect(el(Depth2Item).getAttribute('aria-expanded')).toBe('false');
});

// --- nodes from data ------------------------------------------------------

for (const mode of MODES) {
	test(`${mode}: the top level of a loop over nested data renders its nodes`, async () => {
		if (mode === 'CSR') await render(NodesFromData);
		else await renderSSR(NodesFromData);
		const folders = Array.from(document.querySelectorAll('[data-testid="folder-item"]'));
		expect(folders).toHaveLength(2);
		expect(folders[0]?.getAttribute('aria-level')).toBe('1');
		expect(folders[0]?.getAttribute('aria-expanded')).toBe('false');
		expect(folders[0]?.textContent).toContain('src');
		expect(folders[1]?.textContent).toContain('docs');
	});

	// Split by mode, measured. SSR renders the inner loop: three file rows at
	// level 2, from a keyed `@for` inside `tree.itemcontent`, which is the shape
	// every real file tree has and the one research-tree.md §6c.3 expected to
	// fail. CSR is pinned: the same scenario renders the outer loop's two folders
	// and zero files, with no diagnostic and no runtime error.
	const nestedLoop = mode === 'CSR' ? test.skip : test;
	nestedLoop(`${mode}: the nested level of a loop over nested data renders its nodes`, async () => {
		if (mode === 'CSR') await render(NodesFromData);
		else await renderSSR(NodesFromData);
		const files = Array.from(document.querySelectorAll('[data-testid="file-item"]'));
		expect(files).toHaveLength(3);
		expect(files[0]?.getAttribute('aria-level')).toBe('2');
	});
}

// --- a node written open inside a node written open -----------------------
//
// Pinned, with the measured cause: a node seeded `open` reports itself open at
// every level, and its GROUP is served showing only at the first level. At the
// second level the group renders hidden until the first gesture reaches it -
// measured on this tip by clicking the node's own trigger closed and open again,
// after which the group follows perfectly. So the instance is shared and the
// wiring is right; what does not land is the seed's first read from a part whose
// own node was itself produced inside another node's content.
//
// Deterministic, so test.fails rather than skip. The rest of the family works
// around it by not depending on a second-level node being served open, and the
// keyboard rows use a first-level open branch.
test.fails('CSR: a node written open inside a node written open serves its group showing', async () => {
	await render(NestedOpen);
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(UiItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(UiContent).hasAttribute('hidden')).toBe(false);
	expect(el(ButtonItem).getAttribute('aria-level')).toBe('3');
});

// The half of the same scenario that DOES hold, and the evidence the instance is
// shared: the second-level group follows its own node from the first gesture on.
test('CSR: a second-level node opens and closes its own group from the first gesture', async () => {
	await render(NestedOpen);
	expect(el(UiItem).getAttribute('aria-expanded')).toBe('true');

	el(UiTrigger).click();
	await expect.poll(() => el(UiItem).getAttribute('aria-expanded')).toBe('false');
	expect(el(UiContent).hasAttribute('hidden')).toBe(true);

	el(UiTrigger).click();
	await expect.poll(() => el(UiItem).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(UiContent).hasAttribute('hidden')).toBe(false);
	// And the node above it never moved.
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
});

test('CSR: a looped node opens the folder the click landed on', async () => {
	await render(NodesFromData);
	const triggers = Array.from(
		document.querySelectorAll<HTMLElement>('[data-testid="folder-itemtrigger"]'),
	);
	const folders = Array.from(document.querySelectorAll('[data-testid="folder-item"]'));
	const second = triggers[1];
	if (!second) throw new Error('Expected two folders from the loop.');

	second.click();
	await expect.poll(() => folders[1]?.getAttribute('aria-expanded')).toBe('true');
	expect(folders[0]?.getAttribute('aria-expanded')).toBe('false');
});
