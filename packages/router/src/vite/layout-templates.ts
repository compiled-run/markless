// Build side of layout templates: from the fragments of a sample of pages, the text their layouts share.
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'pathe';
import { FRAGMENT_PATH_PREFIX, FRAGMENT_REGION_END } from './fragment-navigation.ts';
import type { LayoutTemplate } from './runtime/layout-template.ts';
import { layoutTemplateHash, splitByLayout } from './runtime/layout-template.ts';

const HOLE = -1;
const UNKNOWN = -2;
// A page no template holds narrows the closest one only when that template keeps this share of its text.
const REFINE_KEEP = 0.85;
// At most this many tokens only one page lacks read as that page leaving itself out.
const SELF_OMISSIONS = 8;
// A shared run shorter than this stays in the page's own text: a fill boundary costs about as much.
const MIN_SEGMENT = 32;
// A layout worth a template download: below this, a page's own fragment is about as small.
const MIN_TEMPLATE = 2048;
// Gaps between anchors no larger than this (cells of the table) are aligned exactly.
const EXACT_GAP_CELLS = 250_000;

/** Tags, comments and runs of text split after punctuation and spaces, so a small change stays a small hole. */
export function tokenize(text: string): string[] {
	return text.match(/<!--[\s\S]*?-->|<[^>]*>|[^<,;\s]+[,;\s]*|[,;\s]+|</g) ?? [];
}

class Interner {
	readonly ids = new Map<string, number>();
	readonly texts: string[] = [];
	id(token: string): number {
		let id = this.ids.get(token);
		if (id === undefined) {
			id = this.texts.push(token) - 1;
			this.ids.set(token, id);
		}
		return id;
	}
}

// Index pairs of a common subsequence of `a` and `b`: tokens unique to both anchor it, exact alignment fills small gaps.
function commonPairs(a: ArrayLike<number>, b: ArrayLike<number>): Array<[number, number]> {
	const pairs: Array<[number, number]> = [];
	const walk = (aFrom: number, aTo: number, bFrom: number, bTo: number): void => {
		while (aFrom < aTo && bFrom < bTo && a[aFrom] === b[bFrom]) pairs.push([aFrom++, bFrom++]);
		const tail: Array<[number, number]> = [];
		while (aTo > aFrom && bTo > bFrom && a[aTo - 1] === b[bTo - 1]) tail.push([--aTo, --bTo]);
		if (aFrom < aTo && bFrom < bTo) {
			const anchors = uniqueAnchors(a, aFrom, aTo, b, bFrom, bTo);
			if (anchors.length) {
				let ai = aFrom;
				let bi = bFrom;
				for (const [x, y] of anchors) {
					walk(ai, x, bi, y);
					pairs.push([x, y]);
					ai = x + 1;
					bi = y + 1;
				}
				walk(ai, aTo, bi, bTo);
			} else if ((aTo - aFrom) * (bTo - bFrom) <= EXACT_GAP_CELLS) {
				exactPairs(a, aFrom, aTo, b, bFrom, bTo, pairs);
			}
		}
		for (let at = tail.length - 1; at >= 0; at--) pairs.push(tail[at]!);
	};
	walk(0, a.length, 0, b.length);
	return pairs;
}

// Tokens that occur once in each range, in an order both ranges agree on (longest increasing run).
function uniqueAnchors(
	a: ArrayLike<number>,
	aFrom: number,
	aTo: number,
	b: ArrayLike<number>,
	bFrom: number,
	bTo: number,
): Array<[number, number]> {
	const inA = new Map<number, number>();
	for (let at = aFrom; at < aTo; at++) inA.set(a[at]!, inA.has(a[at]!) ? -1 : at);
	const inB = new Map<number, number>();
	for (let at = bFrom; at < bTo; at++) {
		const at_ = inA.get(b[at]!);
		if (at_ === undefined || at_ === -1) continue;
		inB.set(b[at]!, inB.has(b[at]!) ? -1 : at);
	}
	const candidates: Array<[number, number]> = [];
	for (const [token, y] of inB) if (y !== -1) candidates.push([inA.get(token)!, y]);
	candidates.sort((left, right) => left[0] - right[0]);
	// Longest increasing subsequence on the b side.
	const tails: number[] = [];
	const previous = new Int32Array(candidates.length).fill(-1);
	for (let index = 0; index < candidates.length; index++) {
		const y = candidates[index]![1];
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (candidates[tails[middle]!]![1] < y) low = middle + 1;
			else high = middle;
		}
		if (low > 0) previous[index] = tails[low - 1]!;
		tails[low] = index;
	}
	const chain: Array<[number, number]> = [];
	for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]!)
		chain.push(candidates[index]!);
	return chain.reverse();
}

function exactPairs(
	a: ArrayLike<number>,
	aFrom: number,
	aTo: number,
	b: ArrayLike<number>,
	bFrom: number,
	bTo: number,
	pairs: Array<[number, number]>,
): void {
	const rows = aTo - aFrom;
	const columns = bTo - bFrom;
	const table = new Uint32Array((rows + 1) * (columns + 1));
	const cell = (row: number, column: number) => row * (columns + 1) + column;
	for (let row = rows - 1; row >= 0; row--)
		for (let column = columns - 1; column >= 0; column--)
			table[cell(row, column)] =
				a[aFrom + row] === b[bFrom + column]
					? table[cell(row + 1, column + 1)]! + 1
					: Math.max(table[cell(row + 1, column)]!, table[cell(row, column + 1)]!);
	let row = 0;
	let column = 0;
	while (row < rows && column < columns) {
		if (a[aFrom + row] === b[bFrom + column]) {
			pairs.push([aFrom + row++, bFrom + column++]);
		} else if (table[cell(row + 1, column)]! >= table[cell(row, column + 1)]!) row++;
		else column++;
	}
}

// What a template and a page share: the template's tokens the page also has, in order, with a hole wherever either side has more.
function intersect(template: Int32Array, page: Int32Array): number[] {
	const solid: number[] = [];
	const holeBefore: boolean[] = [];
	let pendingHole = false;
	for (const token of template) {
		if (token === HOLE) pendingHole = true;
		else {
			solid.push(token);
			holeBefore.push(pendingHole);
			pendingHole = false;
		}
	}
	const trailingHole = pendingHole;
	const out: number[] = [];
	let lastA = -1;
	let lastB = -1;
	for (const [x, y] of commonPairs(solid, page)) {
		const contiguous = x === lastA + 1 && y === lastB + 1 && !holeBefore[x];
		if (!contiguous && out.at(-1) !== HOLE) out.push(HOLE);
		out.push(solid[x]!);
		lastA = x;
		lastB = y;
	}
	if (
		(lastA !== solid.length - 1 || lastB !== page.length - 1 || trailingHole) &&
		out.at(-1) !== HOLE
	)
		out.push(HOLE);
	return out;
}

// Short shared runs are mostly tokens two pages' contents happen to share: they become part of the hole around them.
function withoutShortRuns(template: readonly number[], lengths: readonly number[]): Int32Array {
	const out: number[] = [];
	let run: number[] = [];
	let runLength = 0;
	const close = () => {
		if (runLength >= MIN_SEGMENT) out.push(...run);
		else if (run.length && out.at(-1) !== HOLE) out.push(HOLE);
		run = [];
		runLength = 0;
	};
	for (const token of template) {
		if (token !== HOLE) {
			run.push(token);
			runLength += lengths[token]!;
			continue;
		}
		close();
		if (out.at(-1) !== HOLE) out.push(HOLE);
	}
	close();
	return Int32Array.from(out);
}

function sharedLength(template: Int32Array, lengths: readonly number[]): number {
	let total = 0;
	for (const token of template) if (token !== HOLE) total += lengths[token]!;
	return total;
}

// What a run of tokens costs compressed, roughly: a token repeated within it is nearly free after its first copy.
function distinctLength(template: Int32Array, lengths: readonly number[]): number {
	const seen = new Set<number>();
	let total = 0;
	for (const token of template)
		if (token !== HOLE && !seen.has(token)) {
			seen.add(token);
			total += lengths[token]!;
		}
	return total;
}

// The distinct text `whole` has beyond `part`, a template made from it. A page leaving itself out (its own link, its
// own route entry) shows as a few tokens every member but that page renders; every page's own text goes to the hole
// anyway, so those do not count. A page missing more than a few is a different layout, and does.
function lostLength(
	whole: Int32Array,
	part: Int32Array,
	lengths: readonly number[],
	members: readonly number[],
	presence: readonly Set<number>[],
): number {
	const kept = new Map<number, number>();
	for (const token of part) if (token !== HOLE) kept.set(token, (kept.get(token) ?? 0) + 1);
	const lost = new Set<number>();
	for (const token of whole) {
		if (token === HOLE) continue;
		const left = kept.get(token) ?? 0;
		if (left > 0) kept.set(token, left - 1);
		else lost.add(token);
	}
	const lacking = new Map<number, number>();
	const onlyMissing = new Map<number, number>();
	if (members.length > 2)
		for (const token of lost) {
			const missing = members.filter((member) => !presence[member]!.has(token));
			if (missing.length !== 1) continue;
			onlyMissing.set(token, missing[0]!);
			lacking.set(missing[0]!, (lacking.get(missing[0]!) ?? 0) + 1);
		}
	let total = 0;
	for (const token of lost) {
		const member = onlyMissing.get(token);
		if (member === undefined || lacking.get(member)! > SELF_OMISSIONS) total += lengths[token]!;
	}
	return total;
}

function segmentsOf(template: Int32Array, texts: readonly string[]): string[] {
	const segments: string[] = [];
	let run = '';
	for (const token of template) {
		if (token === HOLE) {
			if (run.length >= MIN_SEGMENT) segments.push(run);
			run = '';
		} else run += texts[token];
	}
	if (run.length >= MIN_SEGMENT) segments.push(run);
	return segments;
}

export interface LayoutPage {
	readonly path: string;
	/** The fragment's region document, up to the region end marker. */
	readonly text: string;
}

/**
 * Groups pages by the layout their fragments share and returns one template per group of two or more:
 * the text every member renders, in order, as segments a page's own text fills the gaps between.
 */
export async function layoutTemplates(
	pages: readonly LayoutPage[],
	rest: AsyncIterable<LayoutPage> | Iterable<LayoutPage> = [],
): Promise<LayoutTemplates> {
	const interner = new Interner();
	const encoded = pages.map((page) =>
		Int32Array.from(tokenize(page.text), (token) => interner.id(token)),
	);
	const lengths = interner.texts.map((text) => text.length);
	const presence = encoded.map((tokens) => new Set(tokens));
	type Cluster = { template: Int32Array; shared: number; cost: number; members: number[] };
	const clusters: Array<Cluster | undefined> = encoded.map((template, index) => ({
		template,
		shared: sharedLength(template, lengths),
		cost: distinctLength(template, lengths),
		members: [index],
	}));
	const merged = new Map<string, Cluster>();
	const key = (left: number, right: number) => `${left}:${right}`;
	const candidate = (left: number, right: number): Cluster | undefined => {
		const known = merged.get(key(left, right));
		if (known) return known;
		const a = clusters[left]!;
		const b = clusters[right]!;
		const template = withoutShortRuns(intersect(a.template, b.template), lengths);
		const shared = sharedLength(template, lengths);
		const cost = distinctLength(template, lengths);
		const cluster = { template, shared, cost, members: [...a.members, ...b.members] };
		merged.set(key(left, right), cluster);
		return cluster;
	};
	for (;;) {
		let best: { left: number; right: number; cluster: Cluster; gain: number } | undefined;
		for (let left = 0; left < clusters.length; left++) {
			if (!clusters[left]) continue;
			for (let right = left + 1; right < clusters.length; right++) {
				if (!clusters[right]) continue;
				const cluster = candidate(left, right)!;
				const a = clusters[left]!;
				const b = clusters[right]!;
				if (cluster.shared < MIN_TEMPLATE) continue;
				const members = [...a.members, ...b.members];
				// One template download saved, against what every page of either group no longer shares on each visit.
				const gain =
					a.cost +
					b.cost -
					cluster.cost -
					a.members.length *
						lostLength(a.template, cluster.template, lengths, members, presence) -
					b.members.length *
						lostLength(b.template, cluster.template, lengths, members, presence);
				if (gain > 0 && (!best || gain > best.gain)) best = { left, right, cluster, gain };
			}
		}
		if (!best) break;
		clusters[best.left] = best.cluster;
		clusters[best.right] = undefined;
		for (const stale of merged.keys()) {
			const [left, right] = stale.split(':').map(Number);
			if (
				left === best.left ||
				right === best.left ||
				left === best.right ||
				right === best.right
			)
				merged.delete(stale);
		}
	}
	type Layout = { template: Int32Array; shared: number; segments: string[] };
	const layouts: Layout[] = [];
	for (const cluster of clusters) {
		if (!cluster || cluster.members.length < 2) continue;
		const { template, shared } = cluster;
		layouts.push({ template, shared, segments: segmentsOf(template, interner.texts) });
	}
	// Every other page: one no template holds yet narrows the closest template, when it keeps most of it.
	let held = pages.length;
	let seen = pages.length;
	for await (const page of rest) {
		seen++;
		if (
			layouts.some((layout) =>
				splitByLayout(page.text, { hash: '', segments: layout.segments }),
			)
		) {
			held++;
			continue;
		}
		// A token no template has never matches one; it need not join the table.
		const ids = Int32Array.from(
			tokenize(page.text),
			(token) => interner.ids.get(token) ?? UNKNOWN,
		);
		let best: { layout: Layout; template: Int32Array; shared: number } | undefined;
		for (const layout of layouts) {
			const template = withoutShortRuns(intersect(layout.template, ids), lengths);
			const shared = sharedLength(template, lengths);
			if (shared >= layout.shared * REFINE_KEEP && (!best || shared > best.shared))
				best = { layout, template, shared };
		}
		if (!best) continue;
		best.layout.template = best.template;
		best.layout.shared = best.shared;
		best.layout.segments = segmentsOf(best.template, interner.texts);
		held++;
	}
	const templates: LayoutTemplate[] = [];
	for (const layout of layouts) {
		const { segments } = layout;
		if (segments.reduce((total, segment) => total + segment.length, 0) < MIN_TEMPLATE) continue;
		templates.push({ hash: layoutTemplateHash(segments), segments });
	}
	return { templates, pages: seen, held };
}

export interface LayoutTemplates {
	readonly templates: LayoutTemplate[];
	/** Pages rendered, and how many of them a template held while the templates were built. */
	readonly pages: number;
	readonly held: number;
}

// Enough pages to see each section's layout more than once; every pair of them is compared.
const SAMPLE_PAGES = 48;
// Every other page refines the templates, up to this many in all.
const MAX_PAGES = 1000;
const RENDER_TIMEOUT_MS = 10_000;

/** Up to SAMPLE_PAGES paths, taken in turn from each first path segment so every section is seen. */
export function sampleLayoutPaths(pathnames: readonly string[]): string[] {
	const sections = new Map<string, string[]>();
	for (const pathname of [...pathnames].sort()) {
		const section = pathname.split('/')[1] ?? '';
		sections.set(section, [...(sections.get(section) ?? []), pathname]);
	}
	const sample: string[] = [];
	for (let round = 0; sample.length < SAMPLE_PAGES; round++) {
		let took = false;
		for (const paths of sections.values()) {
			if (round >= paths.length || sample.length >= SAMPLE_PAGES) continue;
			// Spread across the section rather than its first few pages.
			sample.push(
				paths[Math.floor((round * paths.length) / Math.min(paths.length, SAMPLE_PAGES))]!,
			);
			took = true;
		}
		if (!took) break;
	}
	return [...new Set(sample)];
}

/**
 * Renders the region document of the app's pages through the built page server, a sample first, and returns
 * the layouts they share. A page that fails, times out or answers anything but 200 HTML is left out.
 */
export async function buildLayoutTemplates(
	serverEntry: string,
	pathnames: readonly string[],
): Promise<LayoutTemplates> {
	const sample = sampleLayoutPaths(pathnames);
	if (sample.length < 2) return { templates: [], pages: 0, held: 0 };
	const chosen = new Set(sample);
	const rest = pathnames.filter((path) => !chosen.has(path)).slice(0, MAX_PAGES - sample.length);
	const dir = await mkdtemp(join(tmpdir(), 'markless-layouts-'));
	try {
		await renderInChild(
			serverEntry,
			[sample, rest],
			[join(dir, 'sample.jsonl'), join(dir, 'rest.jsonl')],
		);
		const pages: LayoutPage[] = [];
		for await (const page of readPages(join(dir, 'sample.jsonl'))) pages.push(page);
		return await layoutTemplates(pages, readPages(join(dir, 'rest.jsonl')));
	} catch {
		// A page server that cannot run at build still navigates by whole fragments.
		return { templates: [], pages: 0, held: 0 };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function* readPages(file: string): AsyncGenerator<LayoutPage> {
	const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
	for await (const line of lines) if (line) yield JSON.parse(line) as LayoutPage;
}

// A separate Node process imports the page server exactly as the deployed server runs it: a test runner or
// plugin host that transforms modules would print the inline scripts the server serializes differently.
async function renderInChild(
	serverEntry: string,
	groups: readonly (readonly string[])[],
	files: readonly string[],
): Promise<void> {
	const render = renderRegionDocuments.toString();
	const steps = groups
		.map(
			(paths, index) =>
				`await (${render})(load, ${JSON.stringify(paths)}, ${JSON.stringify(FRAGMENT_PATH_PREFIX)}, ${JSON.stringify(FRAGMENT_REGION_END)}, ${RENDER_TIMEOUT_MS}, (page) => appendFileSync(${JSON.stringify(files[index])}, JSON.stringify(page) + '\\n'));`,
		)
		.join('\n');
	const script = `import { appendFileSync, writeFileSync } from 'node:fs';
${files.map((file) => `writeFileSync(${JSON.stringify(file)}, '');`).join('\n')}
const load = () => import(${JSON.stringify(pathToFileURL(serverEntry).href)});
${steps}
process.exit(0);`;
	const pages = groups.reduce((total, paths) => total + paths.length, 0);
	await new Promise<void>((resolve, reject) =>
		execFile(
			process.execPath,
			['--input-type=module', '--eval', script],
			{
				cwd: dirname(serverEntry),
				maxBuffer: 16 * 1024 * 1024,
				timeout: RENDER_TIMEOUT_MS * (pages + 6),
			},
			(error) => (error ? reject(error) : resolve()),
		),
	);
}

// Serialized into the child process: it must not reference anything outside its own body, and the child script supplies its import.
async function renderRegionDocuments(
	load: () => Promise<unknown>,
	paths: readonly string[],
	prefix: string,
	marker: string,
	timeoutMs: number,
	emit: (page: { path: string; text: string }) => void,
): Promise<void> {
	type Server = { fetch: (request: Request) => Promise<Response> };
	const module = (await load()) as { default?: Server } & Partial<Server>;
	const server = (module.default ?? module) as Server;
	for (const [index, path] of paths.entries()) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			// Each page under its own origin: text that follows the request's host is never shared, so never in a template.
			const response = await server.fetch(
				new Request(`http://layout-${index}.invalid${prefix}${path}`, {
					signal: controller.signal,
				}),
			);
			const type = response.headers.get('content-type') ?? '';
			if (response.status !== 200 || !type.includes('text/html') || !response.body) continue;
			// Up to the marker only: what streams after it (settled @pending arms) is never layout.
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let text = '';
			while (!controller.signal.aborted && !text.includes(marker)) {
				const chunk = await reader.read();
				if (chunk.done) break;
				text += decoder.decode(chunk.value, { stream: true });
			}
			void reader.cancel().catch(() => {});
			const at = text.indexOf(marker);
			if (at !== -1) emit({ path, text: text.slice(0, at) });
		} catch {
			// A page that cannot render at build still navigates by its whole fragment.
		} finally {
			clearTimeout(timer);
		}
	}
}
