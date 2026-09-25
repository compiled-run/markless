import { readFile, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { protocolEventDispatchesMarkless, type ProtocolViewPayload } from '@markless/serializer';
import { resolve } from 'pathe';
import { beforeAll, expect, test } from 'vitest';
import { decodePayloadScripts } from '../../serializer/src/protocol-client.ts';
import { MARKLESS_BUILD_PREFIX } from '../src/build/chunking.ts';
import type { ParsedBundleGraphRecord } from '../src/build/preload-plan.ts';
import { withoutDemand } from '../../../scripts/benchmarks/perf-guards/attribution.mjs';
import { clientAssetsManifestPath } from '../../router/src/vite/client-assets-manifest.ts';
import {
	FRAGMENT_REGION_END,
	FRAGMENT_REQUEST_HEADER,
} from '../../router/src/vite/fragment-navigation.ts';
import {
	chunkName,
	createStageLadder,
	eagerChunkNames,
	execPnpm,
	gzipByChunk,
	payloadScript,
	payPerUse,
	payPerUseReport,
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
import { executedAtLoad, startBuiltServer } from './helpers/executed-at-load.ts';

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

// The staged ladder reads per-module chunk boundaries, so it measures the `packing: false` build.
// The shipped default packs; its page load is gated only against that build: fewer bytes and files
// downloaded, and no more JavaScript executed (V8 block coverage, same page, same settle point).
// Packed chunks run Rolldown's lazy-init wrapper (its helper plus one init call per evaluated chunk):
// measured +64 B on the CSR lane, +0 on the SSR lane.
const EXECUTED_AT_LOAD_DE_MINIMIS = 128;
const SETTLED = '.youtube-frame-host[data-command="cue"]';

let measured: BudgetMeasurement;
let artifacts: OverheadArtifacts;
let eagerChunks: readonly string[];
let packedLoad: PageLoad;
let unpackedLoad: PageLoad;

beforeAll(async () => {
	await buildDemo(true);
	packedLoad = await measurePageLoad();
	measured = await measureBuiltDemo();
	unpackedLoad = await measurePageLoad();
}, 480_000);

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
		measured.payPerUse.undemanded,
		payPerUseReport('music-player-ssr', measured.payPerUse),
	).toEqual([]);
});

test('the pay-per-use gate goes red and names the runtime module it caught', () => {
	const id = measured.payPerUse.demandedFeatures[0];
	expect(id, 'the page must ship at least one demanded runtime feature module').toBeDefined();

	const result = payPerUse(artifacts, eagerChunks, withoutDemand(artifacts.demand, id!));

	expect(result.undemanded).toEqual([id]);
	expect(payPerUseReport('music-player-ssr', result)).toContain(`runtime feature module ${id}`);
});

test('packing downloads less at page load than one chunk per module, and executes no more', () => {
	const detail = JSON.stringify({ packedLoad, unpackedLoad });
	expect(packedLoad.gzipBytes, detail).toBeLessThanOrEqual(unpackedLoad.gzipBytes);
	expect(packedLoad.files, detail).toBeLessThanOrEqual(unpackedLoad.files);
	expect(packedLoad.executedBytes, detail).toBeLessThanOrEqual(
		unpackedLoad.executedBytes + EXECUTED_AT_LOAD_DE_MINIMIS,
	);
	console.info(`packed page-load: ${detail}`);
});

function report(budget: BudgetMeasurement): string {
	return stageReport({
		title: 'music-player-ssr stage bytes',
		budget,
		aggregateNote: `total size-mapped shipped JS: ${budget.aggregate.gzipBytes} gzip bytes across ${budget.aggregate.chunks} chunks`,
	});
}

type PageLoad = {
	readonly chunks: readonly string[];
	readonly gzipBytes: number;
	readonly files: number;
	readonly executedBytes: number;
};

async function buildDemo(packing: boolean): Promise<void> {
	await rm(resolve(demo, '.output'), { force: true, recursive: true });
	// Consumer posture: the wall measures the 'never' build even though the
	// demo's default build keeps the lab instrument (owner rulings 2026-07-12).
	await execPnpm(root, ['--dir', demo, 'build'], {
		MARKLESS_CONSUMER_BUILD: '1',
		MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0',
	});
}

async function measurePageLoad(): Promise<PageLoad> {
	const served = await startBuiltServer(demo);
	try {
		const html = await (await fetch(served.url)).text();
		const chunks = eagerChunkNames(html, scriptTags(html)).sort();
		const gzip = gzipByChunk(clientBuild);
		return {
			chunks,
			gzipBytes: chunks.reduce((total, name) => total + gzip(name), 0),
			files: chunks.length,
			executedBytes: await executedAtLoad(served.url, { settledSelector: SETTLED }),
		};
	} finally {
		await served.close();
	}
}

async function measureBuiltDemo(): Promise<BudgetMeasurement> {
	await buildDemo(false);

	const { aggregateChunks, graph, instrumented } = await readClientBuildArtifacts(clientPublic);
	const gzip = gzipByChunk(clientBuild);
	const sum = (chunks: Iterable<string>) =>
		[...chunks].reduce((total, name) => total + gzip(name), 0);

	const page = parseServedPage(await renderServedPage(demo));
	const navigation = await firstFragmentNavigation(graph);
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
	const preloaded = new Set(page.eagerChunks);
	ladder.marginal(
		'first-navigation marginal',
		`a fragment navigation to ${navigation.destination}: the swap module and the destination's landing code the served page did not preload (its server HTML, ${navigation.htmlGzipBytes} gzip bytes, is not JS)`,
		[...navigation.chunks].filter((chunk) => !preloaded.has(chunk)),
	);

	return {
		stages: ladder.stages,
		aggregate: { chunks: aggregateChunks.length, gzipBytes: sum(aggregateChunks) },
		instrumented,
		payPerUse: payPerUse(artifacts, page.eagerChunks),
	};
}

// A route change swaps in the destination's server region and resumes it like a landing: it downloads
// the swap module and whatever the region's head names. The destination is the first router Link,
// or the page itself when it links none.
async function firstFragmentNavigation(
	graph: ReadonlyMap<string, ParsedBundleGraphRecord>,
): Promise<{
	readonly destination: string;
	readonly chunks: Set<string>;
	readonly htmlGzipBytes: number;
}> {
	const manifest = JSON.parse(
		await readFile(clientAssetsManifestPath(clientPublic), 'utf8'),
	) as { readonly entries: { readonly fragment?: string } };
	if (!manifest.entries.fragment) throw new Error('the build carries no fragment swap module');
	const served = await startBuiltServer(demo);
	try {
		const html = await (await fetch(served.url)).text();
		const link = /<a\b(?=[^>]*\bdata-markless-router-link\b)[^>]*\bhref="([^"]*)"/.exec(html);
		const destination = new URL(link?.[1] ?? '/', served.url);
		const response = await fetch(destination, { headers: { [FRAGMENT_REQUEST_HEADER]: '1' } });
		const body = await response.text();
		const end = body.indexOf(FRAGMENT_REGION_END);
		if (!response.ok || end === -1)
			throw new Error(`no fragment for ${destination.pathname}: ${response.status}`);
		const region = body.slice(0, end);
		return {
			destination: destination.pathname,
			chunks: new Set([
				...staticClosure(graph, [chunkName(manifest.entries.fragment)]),
				...eagerChunkNames(region, scriptTags(region)),
			]),
			htmlGzipBytes: gzipSync(body).length,
		};
	} finally {
		await served.close();
	}
}

type ServedPage = {
	readonly eagerChunks: readonly string[];
	readonly entryChunks: readonly string[];
	readonly resumeChunk: string;
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
