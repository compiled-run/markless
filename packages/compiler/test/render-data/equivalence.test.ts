import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import type { CompileTsrxModuleResult, SemanticMarkupChunk } from '../../src/artifacts.ts';
import { compileTsrxModule } from '../../src/compile-module.ts';

const fixtures = [
	{
		name: 'static HTML and exported-root selection',
		source: `
function Helper() @{ <aside>Helper</aside> }
export function App() @{ <main><h1>Hello</h1><p>Ready</p></main> }
`,
	},
	{
		name: 'dynamic host coordinates',
		source: `
import { state } from '@markless/core';
export function App() @{
	const tag = state('article');
	<main><header>Top</header><{tag} class="card"><b>Body</b></{tag}><footer>End</footer></main>
}
`,
	},
	{
		name: 'branch repeat and boundary shapes',
		source: `
import { computed, state } from '@markless/core';
export function App() @{
	const active = state(true);
	const rows = state([{ id: 'a' }]);
	const data = computed(async () => 'Ready');
	<main>
		@if (active) { <p>On</p> } @else { <p>Off</p> }
		@for (const row of rows; key row.id) { <li>{row.id}</li> }
		@try { <output>{data}</output> } @pending { <i>Wait</i> } @catch (error) { <b>{error.message}</b> }
	</main>
}
`,
	},
	{
		name: 'conditional root rejection',
		source: `
import { state } from '@markless/core';
export function App() @{
	const active = state(true);
	@if (active) { <main>On</main> } @else { <main>Off</main> }
}
`,
	},
	{
		name: 'multiple returned roots rejection',
		source: `
export function App({ choice = false }) @{
	if (choice) return <a>First</a>;
	return <b>Second</b>;
}
`,
	},
	{
		name: 'mixed framework declaration rejection',
		source: `
import { state } from '@markless/core';
export function App() @{
	const count = state(1), label = 'ready';
	<p>{count}{label}</p>
}
`,
	},
] as const;

for (const fixture of fixtures) {
	test(`renderData agrees with publicRenderPlan for ${fixture.name}`, async () => {
		const result = await compileTsrxModule({
			filename: `fixtures/${fixture.name.replaceAll(' ', '-')}.tsrx`,
			source: fixture.source,
			symbols: [],
		});
		assertStructuralAgreement(result);
	});
}

const demoModules = [
	'demos/live-feed/src/App.tsrx',
	'demos/live-feed/src/UpdateSummary.tsrx',
	'demos/live-feed-ssr/pages/index.tsrx',
	'demos/live-feed-ssr/pages/UpdateSummary.tsrx',
	'demos/music-player/src/App.tsrx',
	'demos/music-player/src/components/Library.tsrx',
	'demos/music-player/src/components/LibrarySong.tsrx',
	'demos/music-player/src/components/Nav.tsrx',
	'demos/music-player/src/components/Player.tsrx',
	'demos/music-player/src/components/Song.tsrx',
	'demos/music-player/src/components/YouTubePlayer.tsrx',
	'demos/music-player-ssr/pages/index.tsrx',
	'demos/music-player-ssr/src/components/Library.tsrx',
	'demos/music-player-ssr/src/components/LibrarySong.tsrx',
	'demos/music-player-ssr/src/components/Nav.tsrx',
	'demos/music-player-ssr/src/components/Player.tsrx',
	'demos/music-player-ssr/src/components/Song.tsrx',
	'demos/music-player-ssr/src/components/YouTubePlayer.tsrx',
] as const;

for (const relativePath of demoModules) {
	test(`renderData covers the ${relativePath} demo module`, async () => {
		const path = fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url));
		const result = await compileTsrxModule({
			filename: relativePath,
			source: await readFile(path, 'utf8'),
			symbols: [],
		});
		assertStructuralAgreement(result);
		expect(result.renderData.chunks.length).toBeGreaterThan(0);
	});
}

function assertStructuralAgreement(result: CompileTsrxModuleResult): void {
	expect(result.renderData.branches.map((branch) => branch.branchSiteId)).toEqual(
		result.semanticGraph.branchSites.map((branch) => branch.id),
	);
	expect(result.renderData.repeats.map((repeat) => repeat.repeatId)).toEqual(
		result.semanticGraph.keyedRepeats.map((repeat) => repeat.id),
	);
	expect(result.renderData.boundaries.map((boundary) => boundary.boundaryId)).toEqual(
		result.semanticGraph.asyncBoundaries.map((boundary) => boundary.id),
	);

	if (result.publicRenderPlan.rootTemplateHtml === null) {
		expect(result.renderData.root).toBeNull();
		return;
	}
	expect(result.renderData.root).not.toBeNull();
	const root = result.renderData.chunks.find(
		(chunk) => chunk.id === result.renderData.root?.templateId,
	);
	expect(root).toBeDefined();
	expect(planCompatibleHtml(root!, result.renderData.chunks)).toBe(
		result.publicRenderPlan.rootTemplateHtml,
	);
	assertSharedHostCoordinates(
		root!,
		result.renderData.chunks,
		result.publicRenderPlan.staticHostLocators,
	);
}

function assertSharedHostCoordinates(
	root: SemanticMarkupChunk,
	chunks: ReadonlyArray<SemanticMarkupChunk>,
	planHosts: CompileTsrxModuleResult['publicRenderPlan']['staticHostLocators'],
): void {
	const graphCoordinates = collectHostCoordinateCandidates(root, chunks);
	for (const host of planHosts) {
		const coordinates = graphCoordinates.get(host.hostNodeId);
		expect(coordinates, `missing renderData coordinate for ${host.hostNodeId}`).toBeDefined();
		expect(coordinates).toContainEqual(host.hostPath);
	}
}

function planCompatibleHtml(
	chunk: SemanticMarkupChunk,
	chunks: ReadonlyArray<SemanticMarkupChunk>,
	componentStack: ReadonlyArray<string> = [],
): string {
	let html = '';
	for (const [slotIndex, slot] of chunk.slots.entries()) {
		let statics = chunk.statics[slot.staticIndex] ?? '';
		if (slot.coordinate.kind === 'comment-anchor') {
			statics = statics.replace(`<!--markless-slot:${slotIndex}-->`, '');
		}
		html += statics;
		if (slot.kind === 'text') html += ' ';
		if (slot.kind === 'child-component' && !componentStack.includes(slot.childComponentName)) {
			const child = chunks.find((candidate) => candidate.id === slot.childTemplateId);
			if (child) {
				html += planCompatibleHtml(child, chunks, [
					...componentStack,
					slot.childComponentName,
				]);
			}
		}
	}
	return html + (chunk.statics.at(-1) ?? '');
}

function collectHostCoordinateCandidates(
	root: SemanticMarkupChunk,
	chunks: ReadonlyArray<SemanticMarkupChunk>,
): ReadonlyMap<string, ReadonlyArray<ReadonlyArray<number>>> {
	const coordinates = new Map<string, ReadonlyArray<number>[]>();
	const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const visit = (
		chunk: SemanticMarkupChunk,
		bases: ReadonlyArray<ReadonlyArray<number>>,
		stack: ReadonlySet<string>,
	): void => {
		if (stack.has(chunk.id)) return;
		const nextStack = new Set(stack).add(chunk.id);
		for (const host of chunk.hosts) {
			addCoordinateCandidates(
				coordinates,
				host.hostNodeId,
				extendCoordinateCandidates(bases, chunk, host.coordinate.path),
			);
		}
		for (const slot of chunk.slots) {
			const slotBases = extendCoordinateCandidates(bases, chunk, slot.coordinate.path);
			if (slot.kind === 'dynamic-host') {
				addCoordinateCandidates(coordinates, slot.hostNodeId, slotBases);
				const child = chunksById.get(slot.childChunkId);
				if (child) visit(child, slotBases, nextStack);
				continue;
			}
			if (slot.kind === 'child-component') {
				const child = chunksById.get(slot.childTemplateId);
				if (child) visit(child, slotBases, nextStack);
				continue;
			}
			const nestedIds =
				slot.kind === 'branch'
					? slot.armTemplateIds
					: slot.kind === 'async'
						? Object.values(slot.armTemplateIds)
						: [];
			for (const id of nestedIds) {
				const child = id ? chunksById.get(id) : undefined;
				if (child) visit(child, slotBases, nextStack);
			}
		}
	};
	visit(root, [[]], new Set());
	return coordinates;
}

function extendCoordinateCandidates(
	bases: ReadonlyArray<ReadonlyArray<number>>,
	chunk: SemanticMarkupChunk,
	path: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> {
	const relativePaths =
		chunk.kind === 'dynamic-host-children' ? [path] : [path, normalizeRootPath(path)];
	return uniquePaths(
		bases.flatMap((base) => relativePaths.map((relative) => [...base, ...relative])),
	);
}

function addCoordinateCandidates(
	coordinates: Map<string, ReadonlyArray<number>[]>,
	hostNodeId: string,
	paths: ReadonlyArray<ReadonlyArray<number>>,
): void {
	coordinates.set(hostNodeId, uniquePaths([...(coordinates.get(hostNodeId) ?? []), ...paths]));
}

function uniquePaths(paths: ReadonlyArray<ReadonlyArray<number>>): ReadonlyArray<number>[] {
	return [...new Map(paths.map((path) => [path.join('.'), path])).values()];
}

function normalizeRootPath(path: ReadonlyArray<number>): ReadonlyArray<number> {
	return path[0] === 0 ? path.slice(1) : path;
}
