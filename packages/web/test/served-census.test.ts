import { chromium } from '@playwright/test';
import { expect, test } from 'vitest';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../serializer/src/protocol-locator-paths.ts';
import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '../../serializer/src/protocol-page-markers.ts';
import { marklessRepairCensus } from '../src/fns/served-census-repair.ts';
import { marklessServedCensus } from '../src/inline/served-census.ts';
import { servedElementTree, servedLocatorPaths } from '../src/locator-paths.ts';

const served =
	'<main><ul><li>a</li><li>b</li></ul><p>c</p><section><span>d</span></section><svg><linearGradient></linearGradient></svg></main>';

test('the inline census flags a page a script reordered without changing its element count', async () => {
	const paths = servedLocatorPaths(served, [{ index: 6 }, { index: 7 }])!;
	const source = marklessServedCensus
		.toString()
		.replace('__MARKLESS_PAGE_START__', JSON.stringify(PROTOCOL_CONTAINER_START_COMMENT))
		.replace('__MARKLESS_PAGE_END__', JSON.stringify(PROTOCOL_CONTAINER_END_COMMENT));
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent('<!doctype html><body></body>');
		const shifted = await page.evaluate(
			({ source, served, attribute, paths }) => {
				const census = new Function(`return ${source}`)() as (root: Element, attribute: string) => Element[];
				const run = (change: (root: Element) => void) => {
					const root = document.createElement('div') as Element & { __marklessShifted?: number };
					root.innerHTML = served;
					root.setAttribute(attribute, paths);
					change(root);
					const found = census(root, attribute);
					return { shifted: root.__marklessShifted === 1, found: found.length };
				};
				return {
					untouched: run(() => {}),
					moved: run((root) => {
						const main = root.querySelector('main')!;
						main.insertBefore(root.querySelector('section')!, main.firstChild);
					}),
					added: run((root) => root.querySelector('main')!.append(document.createElement('i'))),
				};
			},
			{ source, served, attribute: PROTOCOL_LOCATOR_PATHS_ATTRIBUTE, paths },
		);
		expect(shifted.untouched).toEqual({ shifted: false, found: servedElementTree(served).elements.length });
		expect(shifted.moved).toEqual({ shifted: true, found: 0 });
		expect(shifted.added).toEqual({ shifted: true, found: 0 });
	} finally {
		await browser.close();
	}
});

type FakeElement = {
	readonly nodeType: 1;
	readonly localName: string;
	children: FakeElement[];
	childNodes: FakeElement[];
	readonly getAttribute: (name: string) => string | null;
	__marklessCensus?: Array<FakeElement | null>;
	__marklessShifted?: number;
};

function element(localName: string, children: FakeElement[] = []): FakeElement {
	return { nodeType: 1, localName, children, childNodes: children, getAttribute: () => null };
}

function inOrder(root: FakeElement): FakeElement[] {
	const out: FakeElement[] = [root];
	const visit = (node: FakeElement) => {
		for (const child of node.children) {
			out.push(child);
			visit(child);
		}
	};
	visit(root);
	return out;
}

test.each([
	['moved before its siblings while a node was added in front', true],
	['moved before its siblings', false],
])('the census repair finds a located element a script %s', (_name, added) => {
	const html = '<div><p>above</p><div></div><section><span>seen</span></section></div>';
	const sectionIndex = 4;
	const spanIndex = 5;
	const paths = servedLocatorPaths(html, [{ index: 2 }, { index: spanIndex }])!;
	const span = element('span');
	const section = element('section', [span]);
	const above = element('p');
	const list = element('div', [above, element('div'), section]);
	const root = element('body', [list]);
	(root as { getAttribute: (name: string) => string | null }).getAttribute = (name) =>
		name === PROTOCOL_LOCATOR_PATHS_ATTRIBUTE ? paths : null;
	list.children.splice(list.children.indexOf(section), 1);
	list.children.unshift(section);
	if (added) list.children.unshift(element('span'));
	root.__marklessCensus = inOrder(root);
	root.__marklessShifted = 1;
	marklessRepairCensus(root as never);
	expect(root.__marklessCensus![2]).toBe(above);
	expect(root.__marklessCensus![sectionIndex]).toBe(section);
	expect(root.__marklessCensus![spanIndex]).toBe(span);
});

test('the census repair finds a located element a script moved to another parent, and leaves its old siblings in place', () => {
	const html =
		'<main><section><p>before</p><div><h2>title</h2><button>press</button></div><button>after</button></section></main>';
	// main 1, section 2, p 3, div 4, h2 5, button 6, button 7
	const paths = servedLocatorPaths(html, [{ index: 3 }, { index: 5 }, { index: 6 }, { index: 7 }])!;
	const title = element('h2');
	const press = element('button');
	const dialog = element('div', [title, press]);
	const before = element('p');
	const after = element('button');
	const section = element('section', [before, dialog, after]);
	const main = element('main', [section]);
	const root = element('body', [main]);
	(root as { getAttribute: (name: string) => string | null }).getAttribute = (name) =>
		name === PROTOCOL_LOCATOR_PATHS_ATTRIBUTE ? paths : null;
	section.children.splice(1, 1);
	root.children.unshift(element('span'));
	root.children.push(element('div'), dialog);
	root.__marklessCensus = inOrder(root);
	root.__marklessShifted = 1;
	marklessRepairCensus(root as never);
	const census = root.__marklessCensus!;
	expect([census[3], census[4], census[5], census[6], census[7]]).toEqual([before, dialog, title, press, after]);
});
