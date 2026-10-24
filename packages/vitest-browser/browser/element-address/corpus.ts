/**
 * Seeded templates that place controls, text updates and constructs in random
 * order around each other inside an @if arm or a @for row, with what a page
 * built from each must do. A control the compiler cannot address from either
 * end is expected to be refused at build time instead.
 */

export type CorpusTarget = {
	readonly id: string;
	readonly kind: 'click' | 'submit';
};

export type CorpusTemplate = {
	readonly name: string;
	readonly family: 'arm' | 'decided' | 'rows';
	readonly source: string;
	readonly targets: ReadonlyArray<CorpusTarget>;
	readonly shows: number;
	readonly interpolations: number;
	readonly refused: boolean;
	/** The rows hold an @if over page state that a [data-flip] button turns off and on again. */
	readonly flips?: true;
};

type Piece = {
	readonly markup: string;
	// Steps the piece takes in an element address (a block is one), or null when render time decides.
	readonly elements: number | null;
	readonly target?: CorpusTarget;
	readonly show?: true;
	readonly interpolation?: true;
	readonly flips?: true;
};

function random(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

type PieceKind =
	| 'text'
	| 'interpolation'
	| 'click'
	| 'submit'
	| 'show'
	| 'nested'
	| 'badge'
	| 'pair'
	| 'note'
	| 'list'
	| 'branch';

function piece(kind: PieceKind, id: string, hit: string, value: string): Piece {
	switch (kind) {
		case 'text':
			return { markup: `plain words ${id}`, elements: 0 };
		case 'interpolation':
			return { markup: `v{${value}}w`, elements: 0, interpolation: true };
		case 'click':
			return {
				markup: `<button data-h="${id}" onClick={() => (hit = ${hit})}>${id}</button>`,
				elements: 1,
				target: { id, kind: 'click' },
			};
		case 'submit':
			return {
				markup: `<form data-h="${id}" onSubmit={(event) => { event.preventDefault(); hit = ${hit}; }}><button type="submit">${id}</button></form>`,
				elements: 1,
				target: { id, kind: 'submit' },
			};
		case 'show':
			return { markup: `<b data-show>{${value}}</b>`, elements: 1, show: true };
		case 'nested':
			return {
				markup: `<div>lead {${value}} <i>mark</i> <button data-h="${id}" onClick={() => (hit = ${hit})}>${id}</button> tail</div>`,
				elements: 1,
				target: { id, kind: 'click' },
			};
		case 'badge':
			return { markup: '<Badge />', elements: 1 };
		case 'pair':
			return { markup: '<Pair />', elements: 2 };
		case 'note':
			return {
				markup: '@if (note) {\n\t\t\t\t<>\n\t\t\t\t\t<s>one</s>\n\t\t\t\t\t<s>two</s>\n\t\t\t\t</>\n\t\t\t}',
				elements: 1,
			};
		case 'list':
			return {
				markup: '@for (const entry of ENTRIES; key entry.id) {\n\t\t\t\t<u>{entry.id}</u>\n\t\t\t}',
				elements: null,
			};
		case 'branch':
			return {
				markup: `@if (open) { <button data-h="${id}" onClick={() => (hit = ${hit})}>${id} {${value}}</button> } @else { <em>closed ${id}</em> }`,
				elements: 1,
				target: { id, kind: 'click' },
				flips: true,
			};
	}
}

// Fixed count on at least one side of every target, or the build must refuse it.
function addressable(pieces: ReadonlyArray<Piece>): boolean {
	return pieces.every((candidate, index) => {
		if (!candidate.target) return true;
		const before = pieces.slice(0, index).every((other) => other.elements !== null);
		const after = pieces.slice(index + 1).every((other) => other.elements !== null);
		return before || after;
	});
}

function pieces(
	next: () => number,
	pool: ReadonlyArray<PieceKind>,
	prefix: string,
	hit: (id: string) => string,
	value: string,
): Piece[] {
	const count = 4 + Math.floor(next() * 5);
	const chosen: Piece[] = [];
	for (let index = 0; index < count; index++) {
		const kind = pool[Math.floor(next() * pool.length)]!;
		const id = `${prefix}${index}`;
		chosen.push(piece(kind, id, hit(id), value));
	}
	if (!chosen.some((candidate) => candidate.target)) {
		const id = `${prefix}${count}`;
		chosen.splice(Math.floor(next() * (count + 1)), 0, piece('click', id, hit(id), value));
	}
	return chosen;
}

const COMPONENTS = `function Badge() @{
	<em>badge</em>
}

function Pair() @{
	<>
		<i>left</i>
		<i>right</i>
	</>
}`;

function describe(
	name: string,
	family: CorpusTemplate['family'],
	source: string,
	chosen: ReadonlyArray<Piece>,
): CorpusTemplate {
	return {
		name,
		family,
		source,
		targets: chosen.flatMap((candidate) => (candidate.target ? [candidate.target] : [])),
		shows: chosen.filter((candidate) => candidate.show).length,
		interpolations: chosen.filter((candidate) => candidate.interpolation).length,
		refused: !addressable(chosen),
		...(chosen.some((candidate) => candidate.flips) ? { flips: true as const } : {}),
	};
}

const body = (chosen: ReadonlyArray<Piece>, indent: string) =>
	chosen.map((candidate) => indent + candidate.markup).join('\n');

// A flippable arm holds only what a flip can rebuild: elements, text and single-root children.
function armTemplate(seed: number): CorpusTemplate {
	const next = random(seed);
	const chosen = pieces(
		next,
		['text', 'interpolation', 'click', 'submit', 'show', 'nested', 'badge'],
		'a',
		(id) => `'${id}'`,
		'count',
	);
	const source = `import { state } from '@markless/core';

${COMPONENTS}

export default function Generated() @{
	let open = state(true);
	let count = state(1);
	let hit = state('none');
	<main>
		<p data-hit>{hit}</p>
		<button data-bump onClick={() => (count = count + 1)}>bump</button>
		<button data-flip onClick={() => (open = !open)}>flip</button>
		@if (open) {
			<section>
${body(chosen, '\t\t\t\t')}
			</section>
		} @else {
			<p>closed</p>
		}
	</main>
}
`;
	return describe(`arm-${seed}`, 'arm', source, chosen);
}

// An arm a prop decides is painted once, so it may hold constructs whose element count varies.
function decidedTemplate(seed: number): CorpusTemplate {
	const chosen = pieces(
		random(seed),
		[
			'text',
			'interpolation',
			'click',
			'submit',
			'show',
			'nested',
			'badge',
			'pair',
			'note',
			'list',
			'list',
		],
		'd',
		(id) => `'${id}'`,
		'count',
	);
	return decidedSource(`decided-${seed}`, chosen);
}

// A control with a @for on each side: no address names it, so the build has to refuse it.
function refusedTemplate(): CorpusTemplate {
	const kinds: PieceKind[] = ['list', 'text', 'click', 'note', 'list'];
	return decidedSource(
		'decided-refused',
		kinds.map((kind, index) => piece(kind, `d${index}`, `'d${index}'`, 'count')),
	);
}

function decidedSource(name: string, chosen: ReadonlyArray<Piece>): CorpusTemplate {
	const source = `import { state } from '@markless/core';

const ENTRIES = [{ id: 'x' }, { id: 'y' }];

${COMPONENTS}

function Panel({ open }: { open: boolean }) @{
	let note = state(true);
	let count = state(1);
	let hit = state('none');
	@if (open) {
		<section>
			<p data-hit>{hit}</p>
			<button data-bump onClick={() => (count = count + 1)}>bump</button>
			<button data-note onClick={() => (note = !note)}>note</button>
${body(chosen, '\t\t\t')}
		</section>
	}
}

export default function Generated() @{
	<main>
		<Panel open={true} />
	</main>
}
`;
	return describe(name, 'decided', source, chosen);
}

function rowsTemplate(seed: number): CorpusTemplate {
	const next = random(seed);
	const chosen = pieces(
		next,
		['text', 'interpolation', 'click', 'submit', 'nested'],
		'r',
		(id) => `\`${id}-\${row.id}\``,
		'row.name',
	);
	const source = `import { state } from '@markless/core';

export default function Generated() @{
	let rows = state([
		{ id: 1, name: 'ada' },
		{ id: 2, name: 'lin' },
	]);
	let hit = state('none');
	<main>
		<p data-hit>{hit}</p>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>
${body(chosen, '\t\t\t\t\t')}
				</li>
			}
		</ul>
	</main>
}
`;
	return describe(`rows-${seed}`, 'rows', source, chosen);
}

// Each row flips its own @if arms over page state, with controls and values placed around them.
function rowBranchesTemplate(seed: number): CorpusTemplate {
	const next = random(seed);
	const chosen = pieces(
		next,
		['text', 'interpolation', 'click', 'nested', 'branch', 'branch'],
		'b',
		(id) => `\`${id}-\${row.id}\``,
		'row.name',
	);
	const source = `import { state } from '@markless/core';

export default function Generated() @{
	let rows = state([
		{ id: 1, name: 'ada' },
		{ id: 2, name: 'lin' },
	]);
	let hit = state('none');
	let open = state(true);
	<main>
		<p data-hit>{hit}</p>
		<button data-flip onClick={() => (open = !open)}>flip</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>
${body(chosen, '\t\t\t\t\t')}
				</li>
			}
		</ul>
	</main>
}
`;
	return describe(`row-branches-${seed}`, 'rows', source, chosen);
}

export function elementAddressCorpus(): ReadonlyArray<CorpusTemplate> {
	const seeds = Array.from({ length: 8 }, (_, index) => 101 + index * 7);
	return [
		...seeds.map(armTemplate),
		...seeds.map(decidedTemplate),
		refusedTemplate(),
		...seeds.slice(0, 6).map(rowsTemplate),
		...seeds.slice(0, 6).map(rowBranchesTemplate),
	];
}
