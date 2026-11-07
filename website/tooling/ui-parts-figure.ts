// The parts figure: a family's demo live on an ink sheet, a numbered ring on each part, and margin notes naming them.
import { readFileSync } from 'node:fs';
import type { PartFacts } from '../components/docs/ui-parts/types.ts';
import { houseParser } from './ui-playground.ts';

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function childrenOf(node: AstNode): AstNode[] {
	const found: AstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'type') continue;
		if (isNode(value)) found.push(value);
		else if (Array.isArray(value)) for (const item of value) if (isNode(item)) found.push(item);
	}
	return found;
}

function jsxName(node: AstNode): string {
	if (node.type === 'JSXMemberExpression')
		return `${jsxName(node.object as AstNode)}.${jsxName(node.property as AstNode)}`;
	return String((node as { name?: unknown }).name ?? '');
}

/** One ringed part: where its ring goes in the demo source. */
export type Ring = {
	readonly part: string;
	readonly number: number;
	/** How many family parts it sits inside, which staggers rings that share a corner. */
	readonly depth: number;
	/** Insert the ring here: just inside the part's opening tag, or after a self-closing part. */
	readonly at: number;
	readonly after: boolean;
	/** The part repeats in a `@for`; only the first row shows its rings. */
	readonly row: boolean;
};

export type PartsPlan = {
	readonly rings: readonly Ring[];
	/** Parts the reader never sees, such as a hidden form field. */
	readonly hidden: readonly PartFacts[];
	/** Parts the demo does not render. */
	readonly absent: readonly PartFacts[];
	/** Where to mark a `@for` row so later rows hide their rings. */
	readonly rowMarks: readonly number[];
	readonly prelude: string;
	readonly render: { readonly start: number; readonly end: number };
	readonly imports: readonly string[];
};

/** Finds each part's first element in the demo and plans its ring, in the family's part order. */
export async function planParts(
	family: string,
	source: string,
	file: string,
	facts: readonly PartFacts[],
): Promise<PartsPlan> {
	const parse = await houseParser();
	const program = parse(source, file);
	const exported = program.body.find((node) => node.type === 'ExportDefaultDeclaration');
	const declaration = (exported as { declaration?: AstNode } | undefined)?.declaration;
	const block = (declaration as { body?: AstNode } | undefined)?.body;
	const render = (block as { render?: AstNode } | undefined)?.render;
	if (!block || !render) throw new Error(`ui-parts-figure: ${file} renders no element.`);

	const first = new Map<string, { node: AstNode; depth: number; row: boolean }>();
	const rowMarks: number[] = [];
	const visit = (node: AstNode, depth: number, row: boolean) => {
		let inner = depth;
		let inRow = row;
		if (node.type === 'JSXForExpression') {
			const body = childrenOf(node).find((child) => child.type === 'JSXElement' || child.type === 'BlockStatement' || child.type === 'JSXFragment');
			const rowElement = body?.type === 'JSXElement' ? body : childrenOf(body ?? node).find((child) => child.type === 'JSXElement');
			if (rowElement && !row) rowMarks.push(((rowElement.openingElement as AstNode).name as AstNode).end);
			inRow = true;
		}
		if (node.type === 'JSXElement') {
			const name = jsxName((node.openingElement as AstNode).name as AstNode);
			if (name.startsWith(`${family}.`)) {
				const part = name.slice(family.length + 1);
				if (!first.has(part)) first.set(part, { node, depth, row: inRow });
				inner = depth + 1;
			}
		}
		for (const child of childrenOf(node)) visit(child, inner, inRow);
	};
	visit(render, 0, false);

	const rings: Ring[] = [];
	const hidden: PartFacts[] = [];
	const absent: PartFacts[] = [];
	for (const fact of facts) {
		const found = first.get(fact.part);
		if (!found) {
			absent.push(fact);
			continue;
		}
		if (fact.hidden) {
			hidden.push(fact);
			continue;
		}
		const opening = found.node.openingElement as AstNode & { selfClosing?: boolean };
		const after = opening.selfClosing === true;
		rings.push({
			part: fact.part,
			number: rings.length + 1,
			depth: found.depth,
			at: after ? found.node.end : opening.end,
			after,
			row: found.row,
		});
	}

	const statements = ((block as { body?: AstNode[] }).body ?? []) as AstNode[];
	const prelude =
		statements.length === 0 ? '' : source.slice(statements[0]!.start, statements[statements.length - 1]!.end);
	const imports = program.body
		.filter((node) => node.type === 'ImportDeclaration')
		.map((node) => source.slice(node.start, node.end));
	return { rings, hidden, absent, rowMarks, prelude, render: { start: render.start, end: render.end }, imports };
}

// Nested parts often share a corner, so each nesting depth rings a different corner.
const CORNERS = ['start-top', 'end-top', 'start-bottom', 'end-bottom'] as const;

function ringMarkup(ring: Ring): string {
	const classes = ['pf-ring', ring.after ? 'pf-after' : '', ring.row ? 'pf-in-row' : ''].filter(Boolean).join(' ');
	return `<span class="${classes}" data-n="${ring.number}" data-corner="${CORNERS[ring.depth % CORNERS.length]}" aria-hidden="true"><svg viewBox="0 0 26 26"><path class="pf-ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">${ring.number}</text></svg></span>`;
}

/** The demo's render with every ring and row mark written in, offsets taken from the parse. */
export function decorate(source: string, plan: PartsPlan): string {
	const edits = [
		...plan.rings.map((ring) => ({ at: ring.at, text: ringMarkup(ring) })),
		...plan.rowMarks.map((at) => ({ at, text: ' data-pf-row' })),
	].sort((a, b) => b.at - a.at);
	let out = source;
	for (const edit of edits) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
	const shift = edits.filter((edit) => edit.at <= plan.render.start).reduce((sum, edit) => sum + edit.text.length, 0);
	const grow = edits.filter((edit) => edit.at > plan.render.start && edit.at <= plan.render.end).reduce((sum, edit) => sum + edit.text.length, 0);
	return out.slice(plan.render.start + shift, plan.render.end + shift + grow);
}

function what(fact: PartFacts): string {
	const element = fact.ariaRole ? `<${fact.element} role="${fact.ariaRole}">` : `<${fact.element}>`;
	const article = /^(?:[aeiou]|h\d)/.test(fact.element) ? 'an' : 'a';
	const shown = fact.hidden ? `a visually hidden ${element}` : `${article} ${element}`;
	return fact.role ? `${fact.role}, ${shown}` : shown;
}

const escape = (text: string) => text.replace(/[{}<>]/g, (char) => `{'${char}'}`);

export type PartsFigureInput = {
	readonly family: string;
	readonly stem: string;
	readonly file: string;
	readonly facts: readonly PartFacts[];
	/** Specifiers from the generated module to the ink kit. */
	readonly inkScreen: string;
	readonly inkArt: string;
};

export function partsFigureName(family: string, stem: string): string {
	const pascal = (text: string) => text.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
	return `Parts${pascal(family)}${pascal(stem)}`;
}

export async function partsFigureModule(input: PartsFigureInput): Promise<string> {
	const source = readFileSync(input.file, 'utf8');
	const plan = await planParts(input.family, source, input.file, input.facts);
	const facts = new Map(input.facts.map((fact) => [fact.part, fact]));
	const render = decorate(source, plan);
	const name = (part: string) => `${input.family}.${part}`;
	const items = plan.rings
		.map(
			(ring) => `\t\t\t\t\t<li data-n="${ring.number}">
						<svg class="note-ring" viewBox="0 0 26 26" aria-hidden="true"><path class="pf-ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">${ring.number}</text></svg>
						<code>${name(ring.part)}</code>
						<span class="what">${escape(what(facts.get(ring.part)!))}</span>
					</li>`,
		)
		.join('\n');
	const unseen = [...plan.hidden, ...plan.absent];
	const extra =
		unseen.length === 0
			? ''
			: `\n\t\t\t\t<p class="tally">${[
					plan.hidden.length > 0
						? `${plan.hidden.map((fact) => `<code>${name(fact.part)}</code> is ${escape(`a visually hidden <${fact.element}>`)}.`).join(' ')}`
						: '',
					plan.absent.length > 0
						? `Not in this example: ${plan.absent.map((fact) => `<code>${name(fact.part)}</code>`).join(', ')}.`
						: '',
				]
					.filter(Boolean)
					.join(' ')}</p>`;
	const total = input.facts.length;
	const hover = plan.rings
		.map(
			(ring) => `\t\t\t.parts-figure:has(.spots li[data-n="${ring.number}"]:hover) .pf-page :has(> .pf-ring[data-n="${ring.number}"]) {
				outline: 2px dashed var(--ring);
				outline-offset: 3px;
			}`,
		)
		.join('\n\n');
	return `${plan.imports.join('\n')}
import InkScreen from ${JSON.stringify(input.inkScreen)};
import { art as ink } from ${JSON.stringify(input.inkArt)};

export default function ${partsFigureName(input.family, input.stem)}() @{
	${plan.prelude}

	<figure class="parts-figure">
		<div class="layout">
			<InkScreen url="localhost:3000" label=${JSON.stringify(`A live ${input.family}, with a numbered ring on each part`)}>
				<div class="pf-page">
					${render}
				</div>
			</InkScreen>
			<figcaption class="notes">
				<p class="note-title">${total} parts of ${input.family}</p>
				<ol class="spots">
${items}
				</ol>${extra}
			</figcaption>
		</div>
		<style>
			.parts-figure {
				container: parts-figure / inline-size;
				margin: var(--space-m) 0;
				--ring: oklch(55% 0.17 30);

				html.dark & {
					--ring: oklch(72% 0.14 35);
				}
			}

			.layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--space-s);
			}

			@container parts-figure (min-width: 860px) {
				.layout {
					grid-template-columns: minmax(0, 1fr) 18rem;
					align-items: center;
				}
			}

			.pf-page {
				--ink: var(--screen-ink);
				--paper: var(--screen-paper);
				display: grid;
				justify-items: center;
				padding: 1.6rem 1.6rem 1.8rem 2.4rem;
			}

			@layer markless {
				:where(.pf-page :has(> .pf-ring:not(.pf-after))) {
					position: relative;
				}
			}

			.pf-page :has(> .pf-ring) {
				overflow-clip-margin: 0.9rem;
			}

			.pf-ring {
				position: absolute;
				z-index: 3;
				width: 1.6rem;
				height: 1.6rem;
				pointer-events: none;
			}

			.pf-ring[data-corner='start-top'] {
				inset-block-start: -0.8rem;
				inset-inline-start: -0.8rem;
			}

			.pf-ring[data-corner='end-top'] {
				inset-block-start: -0.8rem;
				inset-inline-end: -0.8rem;
			}

			.pf-ring[data-corner='start-bottom'] {
				inset-block-end: -0.8rem;
				inset-inline-start: 0.6rem;
			}

			.pf-ring[data-corner='end-bottom'] {
				inset-block-end: -0.8rem;
				inset-inline-end: 0.6rem;
			}

			.pf-after {
				inset: auto;
				margin: -0.8rem 0 0 -0.3rem;
			}

			[data-pf-row] ~ [data-pf-row] .pf-in-row,
			[data-pf-row] ~ [data-pf-row] > .pf-in-row {
				display: none;
			}

			.pf-ring svg,
			.note-ring {
				display: block;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.pf-ring svg {
				border-radius: 50%;
				background: var(--screen-paper);
			}

			.note-ring {
				width: 1.6rem;
				height: 1.6rem;
			}

			.pf-ring-ink {
				fill: var(--ring);
			}

			.parts-figure text {
				fill: var(--ring);
				font: 700 13px 'Shantell Sans', system-ui, sans-serif;
				text-anchor: middle;
			}

${hover}

			.notes {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.note-title {
				margin: 0 0 0.6rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}

			.spots {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
				gap: 0.8rem 1.4rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.spots li {
				display: grid;
				grid-template-columns: auto 1fr;
				column-gap: 0.45rem;
				align-items: center;
			}

			.spots code {
				justify-self: start;
			}

			.what {
				grid-column: 2;
			}

			.tally {
				margin: 0.7rem 0 0;
				padding-block-start: 0.6rem;
				border-block-start: 1.5px dashed color-mix(in oklch, var(--ink) 40%, transparent);
			}
		</style>
	</figure>
}
`;
}
