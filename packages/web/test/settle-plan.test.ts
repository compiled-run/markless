import { expect, test } from 'vitest';
import { marklessApplySettlePlan, type SettlePlanBoundary } from '../src/fns/settle-plan.ts';

// A synthetic DOM in the node project, the same trade `commit-arm.test.ts`
// documents: anchor-range splicing and hole placement are structural facts a
// fake tree proves exactly. The two things a fake tree could hide are closed
// here on purpose — `innerHTML` and `insertAdjacentHTML` throw, so any
// markup-parsing sink fails the test, and `serialize()` escapes text nodes, so
// a value carrying markup characters can only pass by having been placed as
// text. Real-browser proof of the whole settle path lands with S4b's boxes,
// where a shipped page actually runs this module.

type FakeNode = {
	nodeType: number;
	data?: string;
	tagName?: string;
	attributes?: Record<string, string>;
	childNodes: FakeNode[];
	parentNode: FakeNode | null;
	ownerDocument: FakeDocument;
	readonly nextSibling: FakeNode | null;
	cloneNode(deep: boolean): FakeNode;
	appendChild(node: FakeNode): FakeNode;
	insertBefore(node: FakeNode, reference: FakeNode | null): FakeNode;
	removeChild(node: FakeNode): FakeNode;
	setAttribute?(name: string, value: string): void;
	content?: FakeNode;
	innerHTML?: never;
};

type FakeDocument = {
	createTextNode(data: string): FakeNode;
	createDocumentFragment(): FakeNode;
	createTreeWalker(root: FakeNode, whatToShow: number): { nextNode(): FakeNode | null };
};

const NODE = { element: 1, text: 3, comment: 8, fragment: 11 } as const;

function fakeDocument(): FakeDocument {
	const document: FakeDocument = {
		createTextNode: (data: string) => makeNode(NODE.text, { data }),
		createDocumentFragment: () => makeNode(NODE.fragment),
		// Comment-only walker (128 = SHOW_COMMENT), document order, which is the
		// only shape the filler asks for.
		createTreeWalker: (root: FakeNode, whatToShow: number) => {
			if (whatToShow !== 128) throw new Error('unexpected walker filter');
			const found: FakeNode[] = [];
			const visit = (node: FakeNode) => {
				for (const child of node.childNodes) {
					if (child.nodeType === NODE.comment) found.push(child);
					else visit(child);
				}
			};
			visit(root);
			let index = 0;
			return { nextNode: () => found[index++] ?? null };
		},
	};

	function makeNode(nodeType: number, fields: Partial<FakeNode> = {}): FakeNode {
		const node: FakeNode = {
			nodeType,
			childNodes: [],
			parentNode: null,
			ownerDocument: document,
			...fields,
			get nextSibling() {
				const siblings = node.parentNode?.childNodes ?? [];
				return siblings[siblings.indexOf(node) + 1] ?? null;
			},
			cloneNode(deep: boolean): FakeNode {
				const copy = makeNode(node.nodeType, {
					data: node.data,
					tagName: node.tagName,
					attributes: node.attributes ? { ...node.attributes } : undefined,
				});
				if (node.content) copy.content = node.content.cloneNode(true);
				if (deep)
					for (const child of node.childNodes)
						copy.insertBefore(child.cloneNode(true), null);
				return copy;
			},
			appendChild(child: FakeNode): FakeNode {
				return node.insertBefore(child, null);
			},
			insertBefore(child: FakeNode, reference: FakeNode | null): FakeNode {
				// A fragment inserts its children and empties, as the real DOM does.
				if (child.nodeType === NODE.fragment) {
					for (const grandchild of child.childNodes.slice())
						node.insertBefore(grandchild, reference);
					child.childNodes.length = 0;
					return child;
				}
				child.parentNode?.removeChild(child);
				const at = reference ? node.childNodes.indexOf(reference) : node.childNodes.length;
				node.childNodes.splice(at < 0 ? node.childNodes.length : at, 0, child);
				child.parentNode = node;
				return child;
			},
			removeChild(child: FakeNode): FakeNode {
				const at = node.childNodes.indexOf(child);
				if (at >= 0) node.childNodes.splice(at, 1);
				child.parentNode = null;
				return child;
			},
		};
		if (nodeType === NODE.element) {
			node.attributes ??= {};
			node.setAttribute = (name, value) => {
				node.attributes![name] = value;
			};
			// Any markup-parsing sink is a build break, not a style preference.
			Object.defineProperty(node, 'innerHTML', {
				set() {
					throw new Error('innerHTML is not allowed in the settle filler');
				},
			});
			Object.defineProperty(node, 'insertAdjacentHTML', {
				value() {
					throw new Error('insertAdjacentHTML is not allowed in the settle filler');
				},
			});
		}
		return node;
	}

	return Object.assign(document, { makeNode });
}

type Builder = ReturnType<typeof fakeDocument> & {
	makeNode(nodeType: number, fields?: Partial<FakeNode>): FakeNode;
};

function element(document: Builder, tagName: string, children: FakeNode[] = []): FakeNode {
	const node = document.makeNode(NODE.element, { tagName });
	for (const child of children) node.insertBefore(child, null);
	return node;
}

function comment(document: Builder, coordinate: number): FakeNode {
	return document.makeNode(NODE.comment, { data: `mh:${coordinate}` });
}

function template(document: Builder, children: FakeNode[]): FakeNode {
	const node = document.makeNode(NODE.element, { tagName: 'template' });
	node.content = document.makeNode(NODE.fragment);
	for (const child of children) node.content.insertBefore(child, null);
	return node;
}

function serialize(node: FakeNode): string {
	if (node.nodeType === NODE.text) return escapeText(node.data ?? '');
	if (node.nodeType === NODE.comment) return `<!--${node.data}-->`;
	const inner = node.childNodes.map(serialize).join('');
	if (node.nodeType !== NODE.element) return inner;
	const attributes = Object.entries(node.attributes ?? {})
		.map(([name, value]) => ` ${name}="${escapeText(value)}"`)
		.join('');
	return `<${node.tagName}${attributes}>${inner}</${node.tagName}>`;
}

function escapeText(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// The live-feed shape from T011: a channel text hole, a derived weighted-count
// text hole, a data-row-count attribute hole, a row insertion point, and four
// item-relative row holes.
function liveFeedPlan(): SettlePlanBoundary {
	return {
		id: 'boundary:0',
		arm: 'try',
		holes: [
			{ coordinate: 0, kind: 'text', from: ['channel'] },
			{
				coordinate: 1,
				kind: 'text',
				from: {
					symbolId: 'bound:symbol%3A1:component-edge%3A0',
					args: [
						{ node: 'computed:feed', path: ['updates', 'length'] },
						{ node: 'state:weight', path: [] },
					],
				},
			},
			{
				coordinate: 2,
				kind: 'attribute',
				name: 'data-row-count',
				from: ['updates', 'length'],
			},
		],
		repeat: {
			id: 'repeat:0',
			coordinate: 3,
			from: ['updates'],
			holes: [
				{ coordinate: 4, kind: 'attribute', name: 'data-row-key', from: ['id'] },
				{ coordinate: 5, kind: 'text', from: ['project'] },
			],
			emptyHoles: [],
		},
	};
}

function liveFeedFixture() {
	const document = fakeDocument() as Builder;
	const arm = template(document, [
		element(document, 'p', [comment(document, 0)]),
		element(document, 'p', [document.createTextNode('Weighted count '), comment(document, 1)]),
		comment(document, 2),
		element(document, 'ul', [comment(document, 3)]),
	]);
	const row = template(document, [
		comment(document, 4),
		element(document, 'li', [element(document, 'strong', [comment(document, 5)])]),
	]);
	const empty = template(document, [element(document, 'li', [])]);

	const start = document.makeNode(NODE.comment, { data: 'ab:0' });
	const end = document.makeNode(NODE.comment, { data: '/ab:0' });
	const host = element(document, 'main', [
		element(document, 'header', []),
		start,
		element(document, 'p', [document.createTextNode('Checking local updates…')]),
		end,
		element(document, 'footer', []),
	]);
	return { document, arm, row, empty, start, end, host };
}

const FEED = {
	channel: 'local',
	updates: [
		{ id: 'u1', project: 'markless' },
		{ id: 'u2', project: 'router' },
	],
};

function read(node: string, path: ReadonlyArray<string>): unknown {
	const root: Record<string, unknown> = { 'computed:feed': FEED, 'state:weight': 3 };
	let current = root[node];
	for (const segment of path) current = (current as Record<string, unknown>)?.[segment];
	return current;
}

test('path holes, the derived hole and rows all land, spliced between the anchors', () => {
	const fixture = liveFeedFixture();
	const calls: Array<{ symbolId: string; args: ReadonlyArray<unknown> }> = [];

	marklessApplySettlePlan({
		plan: liveFeedPlan(),
		templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
		value: FEED,
		anchors: [fixture.start, fixture.end],
		read,
		derive: (symbolId, args) => {
			calls.push({ symbolId, args });
			return (args[0] as number) * (args[1] as number);
		},
	} as never);

	// The derived hole called the compiled symbol with values read per the
	// plan's {node, path} args — settled data for the boundary's own node, the
	// document's state cell for the other.
	expect(calls).toEqual([{ symbolId: 'bound:symbol%3A1:component-edge%3A0', args: [2, 3] }]);

	expect(serialize(fixture.host)).toBe(
		'<main>' +
			'<header></header>' +
			'<!--ab:0-->' +
			'<p>local</p>' +
			'<p>Weighted count 6</p>' +
			'<ul data-row-count="2">' +
			'<li data-row-key="u1"><strong>markless</strong></li>' +
			'<li data-row-key="u2"><strong>router</strong></li>' +
			'</ul>' +
			'<!--/ab:0-->' +
			'<footer></footer>' +
			'</main>',
	);
});

test('an empty collection takes the empty template', () => {
	const fixture = liveFeedFixture();
	marklessApplySettlePlan({
		plan: liveFeedPlan(),
		templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
		value: { channel: 'quiet', updates: [] },
		anchors: [fixture.start, fixture.end],
		read: (node: string, path: ReadonlyArray<string>) =>
			node === 'computed:feed' ? (path.length === 2 ? 0 : undefined) : 3,
		derive: () => 0,
	} as never);

	const html = serialize(fixture.host);
	expect(html).toContain('<ul data-row-count="0"><li></li></ul>');
	expect(html).not.toContain('data-row-key');
});

test('markup characters in settled data survive as text, never as markup', () => {
	const fixture = liveFeedFixture();
	const value = {
		channel: '<script>alert(1)</script>',
		updates: [{ id: 'a&b"c', project: '<b>bold</b>' }],
	};
	marklessApplySettlePlan({
		plan: liveFeedPlan(),
		templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
		value,
		anchors: [fixture.start, fixture.end],
		read: () => 1,
		derive: () => 1,
	} as never);

	const html = serialize(fixture.host);
	expect(html).toContain('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
	expect(html).toContain('<strong>&lt;b&gt;bold&lt;/b&gt;</strong>');
	expect(html).toContain('data-row-key="a&amp;b"c"');
	// The channel value reached the DOM as one text node, not as elements.
	const channelParagraph = fixture.host.childNodes[2]!;
	expect(channelParagraph.childNodes).toHaveLength(1);
	expect(channelParagraph.childNodes[0]!.nodeType).toBe(3);
});

test('the splice replaces only the nodes between the anchors', () => {
	const fixture = liveFeedFixture();
	const before = fixture.host.childNodes[0]!;
	const after = fixture.host.childNodes[4]!;
	marklessApplySettlePlan({
		plan: liveFeedPlan(),
		templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
		value: FEED,
		anchors: [fixture.start, fixture.end],
		read,
		derive: () => 6,
	} as never);

	expect(fixture.host.childNodes[0]).toBe(before);
	expect(fixture.host.at?.(-1) ?? fixture.host.childNodes.at(-1)).toBe(after);
	expect(fixture.host.childNodes[1]).toBe(fixture.start);
	expect(fixture.host.childNodes.at(-2)).toBe(fixture.end);
	// No hole anchor survives: the first gesture derives records from the live
	// DOM by comment index, so a leftover would shift every record after it.
	expect(serialize(fixture.host)).not.toContain('<!--mh:');
});

test('the templates themselves are not consumed, so a re-settle can run again', () => {
	const fixture = liveFeedFixture();
	const input = {
		plan: liveFeedPlan(),
		templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
		value: FEED,
		anchors: [fixture.start, fixture.end],
		read,
		derive: () => 6,
	};
	marklessApplySettlePlan(input as never);
	const first = serialize(fixture.host);
	marklessApplySettlePlan(input as never);
	expect(serialize(fixture.host)).toBe(first);
});

test('a derived hole with no symbol caller fails closed instead of half-filling', () => {
	const fixture = liveFeedFixture();
	expect(() =>
		marklessApplySettlePlan({
			plan: liveFeedPlan(),
			templates: { arm: fixture.arm, row: fixture.row, empty: fixture.empty },
			value: FEED,
			anchors: [fixture.start, fixture.end],
			read,
		} as never),
	).toThrow(/MARKLESS_SETTLE_PLAN_UNSUPPORTED/);
	// Nothing was spliced: the pending arm is still what the page shows.
	expect(serialize(fixture.host)).toContain('Checking local updates…');
});
