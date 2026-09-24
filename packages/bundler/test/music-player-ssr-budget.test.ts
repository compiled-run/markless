import { rm } from 'node:fs/promises';
import { protocolEventDispatchesMarkless, type ProtocolViewPayload } from '@markless/serializer';
import { resolve } from 'pathe';
import { beforeAll, expect, test } from 'vitest';
import { decodePayloadScripts } from '../../serializer/src/protocol-client.ts';
import { MARKLESS_BUILD_PREFIX } from '../src/build/chunking.ts';
import type { ParsedBundleGraphRecord } from '../src/build/preload-plan.ts';
import { withoutDemand } from '../../../scripts/benchmarks/perf-guards/attribution.mjs';
import {
	chunkName,
	createStageLadder,
	eagerChunkNames,
	execPnpm,
	gzipByChunk,
	importedChunkNames,
	payloadScript,
	payPerUse,
	payPerUseReport,
	unexpectedUndemanded,
	readClientBuildArtifacts,
	readOverheadArtifacts,
	renderServedPage,
	RESUME_MODULE_ATTRIBUTE,
	ROUTER_LINK_RESUMER_ATTRIBUTE,
	scriptSrc,
	scriptTags,
	stageBreakdown,
	stageReport,
	staticClosure,
	wakeClosure,
	type BudgetMeasurement,
	type OverheadArtifacts,
} from './helpers/staged-budget.ts';

const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player-ssr');
const clientPublic = resolve(demo, '.output/public');
const clientBuild = resolve(clientPublic, MARKLESS_BUILD_PREFIX);

// Stage bytes are whole-app totals, so they are reported, not gated (owner ruling 2026-09-24); the
// gate is pay-per-use on the served page's download. Framework weight per runtime module and per
// construct is gated by `pnpm perf:guard`.
const STAGES = [
	'page-load download',
	'page-load execute',
	'interaction 1 marginal',
	'interaction 2 marginal',
	'interaction 3 marginal',
	'first-navigation marginal',
];

let measured: BudgetMeasurement;
let artifacts: OverheadArtifacts;
let eagerChunks: readonly string[];

beforeAll(async () => {
	measured = await measureBuiltDemo();
}, 240_000);

test('music-player-ssr page-load download pays only for runtime features the page uses', () => {
	expect(measured.stages.map((stage) => stage.stage)).toEqual(STAGES);
	expect(
		measured.instrumented,
		'production build must keep execution instrumentation stripped',
	).toEqual([]);
	expect(
		measured.aggregate.chunks,
		'production build must emit client JS chunks',
	).toBeGreaterThan(0);
	console.info(report(measured));
	expect(
		measured.payPerUse.pageMaps.length,
		'the page download must carry its demand maps',
	).toBeGreaterThan(0);
	expect(
		unexpectedUndemanded(measured.payPerUse),
		payPerUseReport('music-player-ssr', measured.payPerUse),
	).toEqual([]);
});

test('the pay-per-use gate goes red and names the runtime module it caught', () => {
	const id = measured.payPerUse.demandedFeatures[0];
	expect(id, 'the page must ship at least one demanded runtime feature module').toBeDefined();

	const result = payPerUse(artifacts, eagerChunks, withoutDemand(artifacts.demand, id!));

	expect(unexpectedUndemanded(result)).toEqual([id]);
	expect(payPerUseReport('music-player-ssr', result)).toContain(`runtime feature module ${id}`);
});

function report(budget: BudgetMeasurement): string {
	return stageReport({
		title: 'music-player-ssr stage bytes',
		budget,
		aggregateNote: `total size-mapped shipped JS: ${budget.aggregate.gzipBytes} gzip bytes across ${budget.aggregate.chunks} chunks`,
	});
}

async function measureBuiltDemo(): Promise<BudgetMeasurement> {
	await rm(resolve(demo, '.output'), { force: true, recursive: true });
	// Consumer posture: the wall measures the 'never' build even though the
	// demo's default build keeps the lab instrument (owner rulings 2026-07-12).
	await execPnpm(root, ['--dir', demo, 'build'], { MARKLESS_CONSUMER_BUILD: '1' });

	const { aggregateChunks, graph, instrumented } = await readClientBuildArtifacts(clientPublic);
	const gzip = gzipByChunk(clientBuild);
	const sum = (chunks: Iterable<string>) =>
		[...chunks].reduce((total, name) => total + gzip(name), 0);

	const page = parseServedPage(await renderServedPage(demo));
	artifacts = readOverheadArtifacts(clientPublic, demo);
	eagerChunks = page.eagerChunks;
	const ladder = createStageLadder(sum, (chunks) => stageBreakdown(artifacts, chunks));

	ladder.standalone(
		'page-load download',
		'every JS file the served HTML makes the browser fetch before any interaction',
		page.eagerChunks,
	);
	ladder.marginal(
		'page-load execute',
		'the static import closure of the resume module the served page names',
		staticClosure(graph, [...page.entryChunks, page.resumeChunk]),
	);
	for (const [index, event] of page.interactions.slice(0, 3).entries()) {
		ladder.marginal(
			`interaction ${index + 1} marginal`,
			`${event.eventName} on <${event.tagName}> waking ${event.symbolIds.join(', ')}`,
			wakeClosure(graph, event.symbolIds),
		);
	}
	ladder.marginal(
		'first-navigation marginal',
		'everything the router link can still demand that the served page did not preload',
		firstNavigationFetches(graph, page.navigationChunks, page.eagerChunks),
	);

	return {
		stages: ladder.stages,
		aggregate: { chunks: aggregateChunks.length, gzipBytes: sum(aggregateChunks) },
		instrumented,
		payPerUse: payPerUse(artifacts, page.eagerChunks),
	};
}

// What a first navigation actually costs the reader: every chunk the router
// link's entry can reach - its static closure and every demand edge behind it -
// minus what the served page's preload links already put in the browser. Demand
// edges count because a chunk that falls out of the static closure is still
// fetched, just one hop later; leaving them out let a planning change read as a
// win when it had only moved the fetch. A ceiling, not an average: an edge the
// running engine skips (a navigation polyfill Chromium never asks for) is
// counted, because no build artifact says which engine is reading.
function firstNavigationFetches(
	graph: ReadonlyMap<string, ParsedBundleGraphRecord>,
	roots: Iterable<string>,
	preloaded: Iterable<string>,
): Set<string> {
	const already = new Set(preloaded);
	const seen = new Set<string>();
	const fetched = new Set<string>();
	const pending = [...roots];
	while (pending.length > 0) {
		const name = pending.pop()!;
		if (seen.has(name)) continue;
		seen.add(name);
		if (name.endsWith('.js') && !already.has(name)) fetched.add(name);
		for (const dep of graph.get(name)?.deps ?? []) pending.push(dep.name);
	}
	return fetched;
}

type ServedPage = {
	readonly eagerChunks: readonly string[];
	readonly entryChunks: readonly string[];
	readonly resumeChunk: string;
	readonly navigationChunks: readonly string[];
	readonly interactions: readonly {
		readonly eventName: string;
		readonly tagName: string;
		readonly symbolIds: readonly string[];
	}[];
};

function parseServedPage(html: string): ServedPage {
	const scripts = scriptTags(html);
	const resumer = scripts.find((script) => RESUME_MODULE_ATTRIBUTE.test(script.attributes));
	if (!resumer) throw new Error('served page carries no resume module marker');
	const routerLinks = scripts.find((script) =>
		ROUTER_LINK_RESUMER_ATTRIBUTE.test(script.attributes),
	);
	if (!routerLinks) throw new Error('served page carries no router-link resumer');

	const { view } = decodePayloadScripts({
		stateScript: payloadScript(scripts, 'markless/state'),
		viewScript: payloadScript(scripts, 'markless/view'),
	});

	const resumeChunk = chunkName(RESUME_MODULE_ATTRIBUTE.exec(resumer.attributes)![1]!);
	return {
		eagerChunks: eagerChunkNames(html, scripts),
		entryChunks: scripts.flatMap((script) => {
			const src = scriptSrc(script);
			return src && chunkName(src) !== resumeChunk ? [chunkName(src)] : [];
		}),
		resumeChunk,
		navigationChunks: [...new Set(importedChunkNames(routerLinks.body))],
		interactions: scriptedInteractions(view),
	};
}

// The scripted order is DOM order: a reader meets a page's controls top-down,
// so the first three interactions are the first three dispatching elements.
function scriptedInteractions(view: ProtocolViewPayload): ServedPage['interactions'] {
	const locators = new Map(view.locators.map((locator) => [locator.hostNodeId, locator]));
	return view.events
		.filter(protocolEventDispatchesMarkless)
		.flatMap((event) => {
			const locator = locators.get(event.hostNodeId);
			return locator
				? [
						{
							eventName: event.eventName,
							tagName: locator.tagName,
							symbolIds: [...event.symbolIds],
							index: locator.index,
						},
					]
				: [];
		})
		.sort((left, right) => left.index - right.index)
		.map(({ index: _index, ...interaction }) => interaction);
}
