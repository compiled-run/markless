import { chromium } from '@playwright/test';
import { expect, test } from 'vitest';
import { censusElements } from '../src/resume-census.ts';
import { marklessFindElementAtDomOrderIndex } from '../src/fns/dom-order.ts';

// The recursive childNodes walk the census used before it took the native walker.
function recursiveCensus(nodes: ArrayLike<Node>): Node[] {
	const elements: Node[] = [];
	(function visit(list: ArrayLike<Node>): void {
		for (const node of Array.from(list)) {
			if (node.nodeType === 1) elements.push(node);
			if (node.childNodes) visit(node.childNodes);
		}
	})(nodes);
	return elements;
}

type PageCensus = (nodes: ArrayLike<Node>) => Node[];
type PageDomOrder = (root: Element & { __marklessCensus?: Node[] }, index: number) => Node;

test('the native census pins the same root-first order as the recursive walk and dom-order', async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent('<!doctype html><body></body>');
		const mismatches = await page.evaluate(
			({ census, domOrder, recursive }) => {
				const censusElements = new Function(`return ${census}`)() as PageCensus;
				const findAt = new Function(`return ${domOrder}`)() as PageDomOrder;
				const reference = new Function(`return ${recursive}`)() as PageCensus;
				let seed = 7;
				const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
				const tags = [
					'div',
					'span',
					'section',
					'ul',
					'li',
					'button',
					'p',
					'template',
					'svg',
				];
				const grow = (parent: Node, depth: number): void => {
					const count = Math.floor(random() * 5);
					for (let index = 0; index < count; index++) {
						const roll = random();
						if (roll < 0.15) parent.appendChild(document.createTextNode('t'));
						else if (roll < 0.25) parent.appendChild(document.createComment('c'));
						else {
							const child = document.createElement(
								tags[Math.floor(random() * tags.length)]!,
							);
							parent.appendChild(child);
							if (depth < 5) grow(child, depth + 1);
						}
					}
				};
				const failures: string[] = [];
				for (let trial = 0; trial < 60; trial++) {
					const root = document.createElement('main') as HTMLElement & {
						__marklessCensus?: Node[];
					};
					document.body.replaceChildren(root);
					grow(root, 0);
					const expected = reference([root]);
					const actual = censusElements([root]);
					const pinned = expected.map((_node, index) => findAt(root, index));
					if (
						actual.length !== expected.length ||
						actual.some((node, index) => node !== expected[index])
					)
						failures.push(`census ${trial}`);
					if (pinned.some((node, index) => node !== expected[index]))
						failures.push(`dom-order ${trial}`);
					const fragment = document.createDocumentFragment();
					grow(fragment, 3);
					const fragmentNodes = Array.from(fragment.childNodes);
					const fragmentCensus = censusElements(fragmentNodes);
					const fragmentExpected = reference(fragmentNodes);
					if (
						fragmentCensus.length !== fragmentExpected.length ||
						fragmentExpected.some((node, index) => node !== fragmentCensus[index])
					)
						failures.push(`fragment ${trial}`);
				}
				return failures;
			},
			{
				census: censusElements.toString(),
				domOrder: marklessFindElementAtDomOrderIndex.toString(),
				recursive: recursiveCensus.toString(),
			},
		);
		expect(mismatches).toEqual([]);
	} finally {
		await browser.close();
	}
});

test('a host without a tree walker censuses in the same order through childNodes', () => {
	type Fake = { nodeType: number; name: string; childNodes: Fake[] };
	const node = (name: string, nodeType = 1, childNodes: Fake[] = []): Fake => ({
		nodeType,
		name,
		childNodes,
	});
	const root = node('root', 1, [
		node('a', 1, [node('text', 3), node('b', 1, [node('c')]), node('comment', 8)]),
		node('fragment', 11, [node('d', 1, [node('e')])]),
		node('f'),
	]);
	expect((censusElements([root]) as Fake[]).map((entry) => entry.name)).toEqual([
		'root',
		'a',
		'b',
		'c',
		'd',
		'e',
		'f',
	]);
});
