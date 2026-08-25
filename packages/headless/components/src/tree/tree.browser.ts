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

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const ReadmeItem = page.getByTestId('readme-item');
const LicenseItem = page.getByTestId('license-item');
const ChangelogItem = page.getByTestId('changelog-item');
const SrcItem = page.getByTestId('src-item');
const SrcTrigger = page.getByTestId('src-itemtrigger');
const SrcContent = page.getByTestId('src-itemcontent');
const SrcLabel = page.getByTestId('src-itemlabel');
const SrcIndicator = page.getByTestId('src-itemindicator');
const IndexItem = page.getByTestId('index-item');
const AppItem = page.getByTestId('app-item');
const UiItem = page.getByTestId('ui-item');
const UiTrigger = page.getByTestId('ui-itemtrigger');
const UiContent = page.getByTestId('ui-itemcontent');
const ButtonItem = page.getByTestId('button-item');
const DocsItem = page.getByTestId('docs-item');
const DocsContent = page.getByTestId('docs-itemcontent');
const IntroItem = page.getByTestId('intro-item');
const AssetsItem = page.getByTestId('assets-item');
const AssetsIndicator = page.getByTestId('assets-itemindicator');
const AssetsLink = page.getByTestId('assets-link');
const LogoItem = page.getByTestId('logo-item');
const AppsItem = page.getByTestId('apps-item');
const BuildItem = page.getByTestId('build-item');
const ConfigItem = page.getByTestId('config-item');
const DraftsItem = page.getByTestId('drafts-item');
const ZipItem = page.getByTestId('zip-item');
const SrcValue = page.getByTestId('src-value');
const UiValue = page.getByTestId('ui-value');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const LeftRoot = page.getByTestId('left-root');
const LeftSrcItem = page.getByTestId('left-src-item');
const LeftSrcTrigger = page.getByTestId('left-src-itemtrigger');
const LeftReadmeItem = page.getByTestId('left-readme-item');
const RightRoot = page.getByTestId('right-root');
const RightSrcItem = page.getByTestId('right-src-item');
const RightReadmeItem = page.getByTestId('right-readme-item');
const Depth4Item = page.getByTestId('depth-4-item');
const Depth3Item = page.getByTestId('depth-3-item');
const Depth4Trigger = page.getByTestId('depth-4-itemtrigger');
const Depth3Trigger = page.getByTestId('depth-3-itemtrigger');
const Depth3Content = page.getByTestId('depth-3-itemcontent');
const Depth2Item = page.getByTestId('depth-2-item');
const Depth1Item = page.getByTestId('depth-1-item');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
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

// A gesture rather than an `open` prop, because a node seeded open serves its group
// hidden until the first gesture reaches it - the pinned row below says so.
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
		// Only an open node reports aria-expanded; every node reports aria-selected="false".
		expect(item.hasAttribute('aria-expanded')).toBe(false);
		expect(item.getAttribute('aria-selected')).toBe('false');
	}
	// The DOM fully represents the hierarchy, so the APG's counters are absent.
	expect(el(ReadmeItem).hasAttribute('aria-setsize')).toBe(false);
	expect(el(ReadmeItem).hasAttribute('aria-posinset')).toBe(false);
	expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);
}

async function expectNestedRendered() {
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(SrcItem).getAttribute('ui-closed')).toBe('');
	expect(el(SrcItem).getAttribute('aria-level')).toBe('1');
	expect(el(SrcContent).getAttribute('role')).toBe('group');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
	// Closed hides the group and never detaches it, so the nodes under it stay.
	await expect.element(IndexItem).toBeInTheDocument();
	expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	expect(el(AppItem).getAttribute('aria-level')).toBe('2');
	expect(el(IndexItem).hasAttribute('aria-expanded')).toBe(false);
	// The trigger is not a second tab stop, and it is named by its own node's label
	// through a minted id nobody spelled.
	expect(el(SrcTrigger).getAttribute('tabindex')).toBe('-1');
	expect(el(SrcLabel).id).toBeTruthy();
	expect(el(SrcTrigger).getAttribute('aria-labelledby')).toBe(el(SrcLabel).id);
	expect(el(SrcIndicator).hasAttribute('aria-hidden')).toBe(false);
	expect(el(SrcIndicator).getAttribute('ui-closed')).toBe('');
}

// A prop the part destructured out of its parameters must not come back through
// `{...rest}`.
function expectItemsDropDestructuredProps() {
	for (const item of [el(SrcItem), el(IndexItem)]) {
		expect(item.hasAttribute('open')).toBe(false);
		expect(item.hasAttribute('leaf')).toBe(false);
		expect(item.hasAttribute('level')).toBe(false);
	}
	expect(el(IndexItem).getAttribute('ui-leaf')).toBe('');
	expect(el(SrcItem).getAttribute('aria-level')).toBe('1');
}

async function expectPreopenedRendered() {
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(SrcItem).getAttribute('ui-open')).toBe('');
	expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	expect(el(DocsItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(DocsContent).hasAttribute('hidden')).toBe(true);
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'src-item',
		'index-item',
		'app-item',
		'docs-item',
	]);
	await expect.element(IntroItem).toBeInTheDocument();
}

function expectDeepRendered() {
	// Four levels of ONE component composing itself, each rooting its own instance.
	expect(el(Depth4Item).getAttribute('aria-level')).toBe('1');
	expect(el(Depth3Item).getAttribute('aria-level')).toBe('2');
	expect(el(Depth2Item).getAttribute('aria-level')).toBe('3');
	expect(el(Depth1Item).getAttribute('aria-level')).toBe('4');
	expect(el(Depth4Item).contains(el(Depth3Item))).toBe(true);
	expect(el(page.getByTestId('depth-4-itemcontent')).contains(el(Depth3Item))).toBe(true);
	expect(el(Depth2Item).contains(el(Depth1Item))).toBe(true);
	expect(el(Depth1Item).contains(el(Depth4Item))).toBe(false);
	for (const item of [el(Depth4Item), el(Depth3Item), el(Depth2Item), el(Depth1Item)]) {
		expect(item.hasAttribute('aria-expanded')).toBe(false);
	}
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
	]);
}

function expectTwoTreesRendered() {
	expect(el(LeftRoot).getAttribute('aria-label')).toBe('Left project');
	expect(el(RightRoot).getAttribute('aria-label')).toBe('Right project');
	expect(visibleRows(el(LeftRoot)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'left-src-item',
		'left-readme-item',
	]);
	expect(visibleRows(el(RightRoot)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'right-src-item',
		'right-readme-item',
	]);
	// Each node mints its own label id, so no trigger points at a neighbour's.
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
	// A locked tree still reports what is open, and the raw prop never reaches it.
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(DocsItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(Root).hasAttribute('disabled')).toBe(false);
}

async function expectUnavailableBlocks() {
	el(page.getByTestId('src-itemtrigger')).click();
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
}

async function expectTriggerOpensAndCloses() {
	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(SrcItem).getAttribute('ui-open')).toBe('');
	expect(el(SrcIndicator).getAttribute('ui-open')).toBe('');

	el(SrcTrigger).click();
	await expect.poll(() => el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);
	await expect.element(IndexItem).toBeInTheDocument();
}

async function expectConsumerCallbackFires() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(SrcValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(page.getByTestId('src-itemtrigger')).click();
	await expect.poll(() => el(SrcValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	expect(el(UiValue).textContent).toBe('');
}

async function expectNestedNodeReachesItsOwnHandler() {
	// The nested node starts open, so its first click reports false.
	el(page.getByTestId('ui-itemtrigger')).click();
	await expect.poll(() => el(UiValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(SrcValue).textContent).toBe('');
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(UiItem).hasAttribute('aria-expanded')).toBe(false);
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
		await expectNestedRendered();
	});

	test(`${mode}: a node drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Nested);
		else await renderSSR(Nested);
		expectItemsDropDestructuredProps();
	});

	// PINNED: a node written `open` reports itself open while its GROUP is served
	// hidden, because the seed the node's body writes does not reach the
	// `tree.itemcontent` part's first read. The group follows from gesture one on.
	test.fails(`${mode}: branches written open render open`, async () => {
		if (mode === 'CSR') await render(Preopened);
		else await renderSSR(Preopened);
		await expectPreopenedRendered();
	});

	test(`${mode}: a node written open still reports itself open`, async () => {
		if (mode === 'CSR') await render(Preopened);
		else await renderSSR(Preopened);
		expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
		expect(el(SrcItem).getAttribute('ui-open')).toBe('');
		expect(el(DocsItem).hasAttribute('aria-expanded')).toBe(false);
		expect(el(IndexItem).getAttribute('aria-level')).toBe('2');
	});

	// PINNED in CSR only: the recursive `@if` is compiled as an escalated branch
	// (the node holds a `computed()`, which is what makes the arm expressible at
	// all), and CSR serves that arm EMPTY - the branch markers are in the group
	// with nothing between them, so only depth-4 exists. SSR unrolls all four
	// levels from the same file.
	const unroll = mode === 'CSR' ? test.fails : test;
	unroll(`${mode}: a self-composing node unrolls to the depth its prop names`, async () => {
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

// PINNED: same wall as the CSR unroll row - the escalated arm is served empty,
// so depth-3 never exists to click.
test.fails('CSR: each unrolled level owns its own open state', async () => {
	await render(Deep);

	el(Depth4Trigger).click();
	await expect.poll(() => el(Depth4Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth3Item).hasAttribute('aria-expanded')).toBe(false);
	expect(el(Depth2Item).hasAttribute('aria-expanded')).toBe(false);
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
		'depth-3-item',
	]);

	el(Depth3Trigger).click();
	await expect.poll(() => el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth3Content).hasAttribute('hidden')).toBe(false);
	expect(el(Depth4Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth2Item).hasAttribute('aria-expanded')).toBe(false);

	// Closing the outermost level leaves every level below it as it was.
	el(Depth4Trigger).click();
	await expect.poll(() => el(Depth4Item).hasAttribute('aria-expanded')).toBe(false);
	expect(el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(visibleRows(el(Root)).map((row) => row.getAttribute('data-testid'))).toEqual([
		'depth-4-item',
	]);
});

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
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(AppItem));
});

// From a closed `src`, the next row down is README.md, not index.ts.
test('CSR: ArrowDown across a closed node skips its children', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(document.activeElement).not.toBe(el(IndexItem));
});

test('CSR: ArrowDown never opens anything', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
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

// ArrowRight is two-phase, and neither phase does the other's work.
test('CSR: ArrowRight opens a closed node without moving focus, then descends', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(document.activeElement).toBe(el(SrcItem));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
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
	await expect.poll(() => el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
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
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
});

// "Enter clicks the first focusable in the row" would follow the link instead,
// because the link is written first - this family does not do that.
test('CSR: Enter on a row opens the node and does not follow the link in it', async () => {
	await render(FileExplorer);
	const hash = window.location.hash;
	el(AssetsItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).getAttribute('aria-expanded')).toBe('true');
	expect(window.location.hash).toBe(hash);
	expect(el(AssetsIndicator).getAttribute('ui-open')).toBe('');
	expect(el(AssetsLink).getAttribute('href')).toBe('#assets-page');
});

test('CSR: Enter on a row closes it again', async () => {
	await render(FileExplorer);
	el(AssetsItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).getAttribute('aria-expanded')).toBe('true');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(AssetsItem).hasAttribute('aria-expanded')).toBe(false);
	await expect.element(LogoItem).toBeInTheDocument();
});

test('CSR: typing a letter moves to the next visible node whose name starts with it', async () => {
	await render(Typeahead);
	el(AppsItem).focus();

	await userEvent.keyboard('c');
	await expect.poll(() => document.activeElement).toBe(el(ConfigItem));

	// The buffer clears after 750ms, so 'b' is a fresh first letter, not 'cb'.
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

test('CSR: typeahead never reaches a node inside a closed branch', async () => {
	await render(Typeahead);
	el(AppsItem).focus();

	await userEvent.keyboard('z');
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(document.activeElement).toBe(el(AppsItem));
	expect(document.activeElement).not.toBe(el(ZipItem));
});

test('CSR: focus moves the one tab stop with it', async () => {
	await render(Nested);
	await openSrc();
	expect(el(Root).getAttribute('tabindex')).toBe('0');
	expect(rows(el(Root)).every((row) => row.getAttribute('tabindex') === '-1')).toBe(true);

	el(SrcItem).focus();
	await expect.poll(() => el(SrcItem).getAttribute('tabindex')).toBe('0');
	// The container steps out of the tab order, so Shift+Tab leaves the tree.
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
	expect(el(RightRoot).getAttribute('tabindex')).toBe('0');
	expect(el(RightReadmeItem).getAttribute('tabindex')).toBe('-1');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(LeftSrcItem));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(LeftSrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(RightSrcItem).hasAttribute('aria-expanded')).toBe(false);
});

test('SSR: the first ArrowRight after resume opens the node, and the second descends', async () => {
	await renderSSR(Nested);
	expect(el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
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
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
});

// PINNED: SSR unrolls all four levels correctly, and then the click on the
// second level's trigger never opens it - `aria-expanded` stays absent.
test.fails('SSR: each unrolled level resumes with its own open state', async () => {
	await renderSSR(Deep);
	expectDeepRendered();

	el(Depth3Trigger).click();
	await expect.poll(() => el(Depth3Item).getAttribute('aria-expanded')).toBe('true');
	expect(el(Depth4Item).hasAttribute('aria-expanded')).toBe(false);
	expect(el(Depth2Item).hasAttribute('aria-expanded')).toBe(false);
});

for (const mode of MODES) {
	test(`${mode}: the top level of a loop over nested data renders its nodes`, async () => {
		if (mode === 'CSR') await render(NodesFromData);
		else await renderSSR(NodesFromData);
		const folders = page.getByTestId('folder-item').elements();
		expect(folders).toHaveLength(2);
		expect(folders[0]?.getAttribute('aria-level')).toBe('1');
		expect(folders[0]?.hasAttribute('aria-expanded')).toBe(false);
		expect(folders[0]?.textContent).toContain('src');
		expect(folders[1]?.textContent).toContain('docs');
	});

	// PINNED in CSR only: a keyed `@for` inside `tree.itemcontent` renders the outer
	// loop's two folders and zero files, with no diagnostic and no runtime error.
	const nestedLoop = mode === 'CSR' ? test.skip : test;
	nestedLoop(`${mode}: the nested level of a loop over nested data renders its nodes`, async () => {
		if (mode === 'CSR') await render(NodesFromData);
		else await renderSSR(NodesFromData);
		const files = page.getByTestId('file-item').elements();
		expect(files).toHaveLength(3);
		expect(files[0]?.getAttribute('aria-level')).toBe('2');
	});
}

// PINNED: a node seeded `open` has its group served showing only at the first level.
// The instance is shared and the wiring is right; what does not land is the seed's
// first read from a part whose node was produced inside another node's content.
test.fails('CSR: a node written open inside a node written open serves its group showing', async () => {
	await render(NestedOpen);
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
	expect(el(UiItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(UiContent).hasAttribute('hidden')).toBe(false);
	expect(el(ButtonItem).getAttribute('aria-level')).toBe('3');
});

// The evidence the instance is shared: the group follows from the first gesture on.
test('CSR: a second-level node opens and closes its own group from the first gesture', async () => {
	await render(NestedOpen);
	expect(el(UiItem).getAttribute('aria-expanded')).toBe('true');

	el(UiTrigger).click();
	await expect.poll(() => el(UiItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(UiContent).hasAttribute('hidden')).toBe(true);

	el(UiTrigger).click();
	await expect.poll(() => el(UiItem).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(UiContent).hasAttribute('hidden')).toBe(false);
	expect(el(SrcItem).getAttribute('aria-expanded')).toBe('true');
});

test('CSR: a looped node opens the folder the click landed on', async () => {
	await render(NodesFromData);
	const triggers = page.getByTestId('folder-itemtrigger').elements() as HTMLElement[];
	const folders = page.getByTestId('folder-item').elements();
	const second = triggers[1];
	if (!second) throw new Error('Expected two folders from the loop.');

	second.click();
	await expect.poll(() => folders[1]?.getAttribute('aria-expanded')).toBe('true');
	expect(folders[0]?.hasAttribute('aria-expanded')).toBe(false);
});
