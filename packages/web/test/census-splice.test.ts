import { expect, test } from 'vitest';
import { censusElements, spliceCensus } from '../src/resume-census.ts';

class FakeNode {
	childNodes: FakeNode[] = [];
	parentElement: FakeNode | null = null;
	constructor(
		readonly nodeType: number,
		readonly name: string,
	) {}
	get parentNode() {
		return this.parentElement;
	}
	get previousSibling(): FakeNode | null {
		const siblings = this.parentElement?.childNodes ?? [];
		return siblings[siblings.indexOf(this) - 1] ?? null;
	}
	insertBefore(node: FakeNode, before: FakeNode | null) {
		node.parentElement?.childNodes.splice(node.parentElement.childNodes.indexOf(node), 1);
		const at = before ? this.childNodes.indexOf(before) : this.childNodes.length;
		this.childNodes.splice(at, 0, node);
		node.parentElement = this;
	}
	remove() {
		this.parentElement?.childNodes.splice(this.parentElement.childNodes.indexOf(this), 1);
		this.parentElement = null;
	}
}

let made = 0;
function row(): FakeNode {
	const tr = new FakeNode(1, `tr${made++}`);
	for (let cell = 0; cell < 3; cell++) {
		const td = new FakeNode(1, `td${made++}`);
		td.insertBefore(new FakeNode(3, 'text'), null);
		if (cell === 1) td.insertBefore(new FakeNode(1, `a${made++}`), null);
		tr.insertBefore(td, null);
	}
	return tr;
}

test('the spliced census matches a fresh one across removes, inserts and moves', () => {
	const root = new FakeNode(1, 'root');
	const header = new FakeNode(1, 'header');
	const body = new FakeNode(1, 'tbody');
	const footer = new FakeNode(1, 'footer');
	for (const node of [header, body, footer]) root.insertBefore(node, null);
	for (let index = 0; index < 30; index++) {
		body.insertBefore(row(), null);
		if (index % 7 === 0) body.insertBefore(new FakeNode(8, 'comment'), null);
	}
	const census = censusElements(root.childNodes) as FakeNode[];
	let seed = 5;
	const random = (limit: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % limit;

	for (let step = 0; step < 200; step++) {
		const rows = body.childNodes.filter((node) => node.nodeType === 1);
		const kind = random(3);
		if (kind === 0 && rows.length > 2) {
			const gone = rows.slice(random(rows.length - 1), undefined).slice(0, 1 + random(3));
			for (const node of gone) node.remove();
			spliceCensus(census, gone, []);
		} else if (kind === 1) {
			const fresh = Array.from({ length: 1 + random(4) }, row);
			const before = body.childNodes[random(body.childNodes.length + 1)] ?? null;
			for (const node of fresh) body.insertBefore(node, before);
			spliceCensus(census, [], fresh);
		} else if (rows.length > 1) {
			const moved = rows[random(rows.length)]!;
			body.insertBefore(moved, body.childNodes[random(body.childNodes.length)] ?? null);
			spliceCensus(census, [moved], [moved]);
		}
		expect(census.map((node) => node.name)).toEqual(
			(censusElements(root.childNodes) as FakeNode[]).map((node) => node.name),
		);
	}
});
