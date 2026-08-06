import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'rolldown';
import {
	assemblePrerenderPageParts,
	renderSsrOutput,
	type SsrRenderable,
	type SsrRenderOutput,
} from '../../../web/src/render-to-string.ts';
import { evaluateBuiltPageClosure } from '../../../web/src/prerender/evaluator.ts';
import { prepareSsrResumeRecords } from '../../../web/src/prerender/records.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';

export type BuiltPrerenderRecords = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export async function deriveBuiltPrerenderRecords(input: {
	readonly entry: string;
	readonly serverPlugin: Plugin;
}): Promise<BuiltPrerenderRecords> {
	return withBuiltPrerenderPage(input, async (page) =>
		prepareSsrResumeRecords(await evaluateBuiltPageClosure(page)),
	);
}

export async function emitPrerenderedPage(input: {
	readonly root: string;
	readonly entry: string;
	readonly outDir: string;
	readonly serverPlugin: Plugin;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
}): Promise<void> {
	const page = await withBuiltPrerenderPage(input, async (built) => {
		const output = await evaluateBuiltPageClosure(built);
		const emission = await deriveArmFillPlan(built, {
			state: output.state,
			bound: artifactSettleBound(built),
		});
		return assemblePrerenderPageParts(built, output, {
			resumeModuleUrl: input.resumeModuleUrl,
			prerenderWakeModuleUrl: input.prerenderWakeModuleUrl,
			armEmission: emission?.html,
		});
	});
	const htmlFile = resolve(input.root, input.outDir, 'index.html');
	const html = await readFile(htmlFile, 'utf8');
	const placeholder = '<div id="app"></div>';
	if (!html.includes(placeholder)) {
		throw new Error(
			'MARKLESS_PRERENDER_CONTAINER_MISSING: expected exact #app build placeholder',
		);
	}
	const withHead = page.head ? html.replace('</head>', `${page.head}</head>`) : html;
	await writeFile(htmlFile, withHead.replace(placeholder, page.container));
}

// ---------------------------------------------------------------------------
// Forced-arm emission (T011 / ruling S3).
//
// The settled arm is markup the build can already produce: run the SAME
// compiled renderer with a fake settle graph whose value is a hole-sentinel
// proxy, and the arm comes out with a stable token wherever settled data would
// have landed. Three row counts (2, 1, none) separate prefix / row / suffix by
// reconstruction. Every step fails closed: any residue that is neither a value
// path nor a compiled derive symbol, any reconstruction mismatch, any surviving
// sentinel, and the boundary keeps the existing path with no plan at all.
// ---------------------------------------------------------------------------

const SENTINEL_OPEN = '';
const SENTINEL_CLOSE = '';
const SENTINEL_PATTERN = /mh(\d+)/g;
// Two probe values for the same holes: a literal derived from settled data
// (weightedCount = updates.length * weight) renders differently under each, so
// an entombed derived literal cannot survive the byte-identity check below.
const PROBE_TAGS = [1_000_003, 8_000_017] as const;

type HolePath = ReadonlyArray<string>;

type ArmHoleSource =
	| HolePath
	| {
			readonly symbolId: string;
			readonly args: ReadonlyArray<{ readonly node: string; readonly path: HolePath }>;
	  };

type ArmHole = {
	readonly coordinate: number;
	readonly kind: 'text' | 'attribute';
	readonly name?: string;
	readonly from: ArmHoleSource;
};

type ArmBoundaryPlan = {
	readonly id: string;
	readonly arm: 'try';
	// The graph node the settled value belongs to, plus the key and version of
	// the runner snapshot the server recorded. The boot calls the runner with the
	// key and hands the wake a snapshot carrying the version, so the runtime
	// adopts the settled value instead of re-running the computed.
	readonly node: string;
	readonly key?: unknown;
	readonly version?: number;
	readonly holes: ReadonlyArray<ArmHole>;
	readonly repeat?: {
		readonly id: string;
		readonly coordinate: number;
		readonly from: HolePath;
		readonly holes: ReadonlyArray<ArmHole>;
		readonly emptyHoles: ReadonlyArray<ArmHole>;
	};
};

export type SettlePlanContext = {
	readonly state?: unknown;
	readonly bound?: Record<string, Record<string, unknown>>;
};

export type ArmFillEmission = {
	readonly html: string;
	readonly planBytes: number;
	readonly templateBytes: number;
	readonly plan: {
		readonly version: 1;
		readonly boundaries: ReadonlyArray<ArmBoundaryPlan>;
		readonly bound?: Record<string, Record<string, unknown>>;
		readonly initial?: Record<string, unknown>;
	};
	readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
};

class ArmPlanUnsupported extends Error {}

function unsupported(reason: string): never {
	throw new ArmPlanUnsupported(reason);
}

function createHoleMinter() {
	const byKey = new Map<string, number>();
	const paths: Array<HolePath> = [];
	return {
		paths,
		sentinel(path: HolePath): string {
			const key = path.join('\u0000');
			let index = byKey.get(key);
			if (index === undefined) {
				index = paths.length;
				byKey.set(key, index);
				paths.push(path);
			}
			return `${SENTINEL_OPEN}mh${index}${SENTINEL_CLOSE}`;
		},
		index(path: HolePath): number {
			const key = path.join('\u0000');
			const found = byKey.get(key);
			if (found === undefined) unsupported(`unminted path: ${path.join('.')}`);
			return found;
		},
	};
}

type Minter = ReturnType<typeof createHoleMinter>;

// One node of the settled value. Property reads answer with stable sentinels;
// `.length` answers with a number-like object because the repeat path needs a
// real number (ToLength) while markup needs the hole token.
function holeProxy(
	minter: Minter,
	path: HolePath,
	options: { readonly rows: number | null; readonly tag: number },
): unknown {
	const target: object =
		options.rows === null ? {} : Array.from({ length: options.rows });
	return new Proxy(target, {
		get(_target, key) {
			if (typeof key === 'symbol') return undefined;
			if (key === 'then') return undefined;
			if (key === 'toString' || key === 'valueOf' || key === 'toJSON')
				return () => minter.sentinel(path);
			if (key === 'length') {
				const sentinel = minter.sentinel([...path, 'length']);
				const tag = options.tag + minter.index([...path, 'length']);
				return { toString: () => sentinel, valueOf: () => tag };
			}
			// Row iteration reads the TARGET length, so the sentinel `.length`
			// above never decides the row count.
			if (key === 'map')
				return (visit: (item: unknown, index: number) => unknown) =>
					Array.from({ length: options.rows ?? 0 }, (_unused, index) =>
						visit(holeProxy(minter, [...path, '[]'], options), index),
					);
			if (/^\d+$/.test(String(key))) return holeProxy(minter, [...path, '[]'], options);
			return holeProxy(minter, [...path, String(key)], options);
		},
		has() {
			return true;
		},
	});
}

export type ForcedArmPass = {
	readonly output: SsrRenderOutput;
	readonly minter: Minter;
};

export async function renderForcedArm(
	page: SsrRenderable,
	rows: number | null,
	tag: number,
): Promise<ForcedArmPass> {
	const minter = createHoleMinter();
	const graph = {
		read: () => ({
			status: 'fulfilled' as const,
			version: 1,
			key: null,
			value: holeProxy(minter, [], { rows, tag }),
		}),
	};
	const output = await renderSsrOutput(page, undefined, { prerenderSettle: { graph } });
	return { output, minter };
}

export async function deriveArmFillPlan(
	page: SsrRenderable,
	context: SettlePlanContext = {},
): Promise<ArmFillEmission | undefined> {
	try {
		const probes = await Promise.all(
			PROBE_TAGS.map(async (tag) => ({
				two: await renderForcedArm(page, 2, tag),
				one: await renderForcedArm(page, 1, tag),
				none: await renderForcedArm(page, null, tag),
			})),
		);
		return buildArmFillEmission(probes, context);
	} catch (error) {
		if (process.env.MARKLESS_ARM_PLAN_DEBUG) throw error;
		return undefined;
	}
}

type ProbeSet = {
	readonly two: ForcedArmPass;
	readonly one: ForcedArmPass;
	readonly none: ForcedArmPass;
};

export function buildArmFillEmission(
	probes: ReadonlyArray<ProbeSet>,
	context: SettlePlanContext = {},
): ArmFillEmission | undefined {
	return planArmEmission(probes, context).emission;
}

export function planArmEmission(
	probes: ReadonlyArray<ProbeSet>,
	context: SettlePlanContext = {},
): {
	readonly emission?: ArmFillEmission;
	readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
} {
	const first = probes[0];
	if (!first) return { skipped: [] };
	const boundaryIds = (first.one.output.structure?.anchors ?? [])
		.filter((anchor) => anchor.kind === 'async')
		.map((anchor) => anchor.id);
	const skipped: Array<{ id: string; reason: string }> = [];
	const plans: Array<ArmBoundaryPlan> = [];
	const markup: string[] = [];
	const bounds: Record<string, Record<string, unknown>> = {};
	const initials: Record<string, unknown> = {};
	for (const id of boundaryIds) {
		const rendered = probes.map((probe, index) => {
			try {
				return buildBoundary(probe, probes[(index + 1) % probes.length]!, id);
			} catch (error) {
				skipped.push({
					id,
					reason: error instanceof ArmPlanUnsupported ? error.message : 'render failed',
				});
				return undefined;
			}
		});
		const [primary, ...rest] = rendered;
		if (!primary) continue;
		// A derived literal baked from probe-dependent data cannot be
		// byte-identical across probes; identity here IS the entombment proof.
		if (rest.some((other) => !other || other.markup !== primary.markup)) {
			skipped.push({ id, reason: 'probe-dependent residue survived in the template' });
			continue;
		}
		if (
			rest.some((other) => JSON.stringify(other!.plan) !== JSON.stringify(primary.plan))
		) {
			skipped.push({ id, reason: 'probe-dependent plan' });
			continue;
		}
		// Every derived-hole argument that is NOT the settled value must be a
		// build-known scalar, or the boot would fill the hole from nothing.
		const initial = initialScalarsFor(primary.plan, context.state);
		const bound = context.bound?.[id];
		if (!initial) {
			skipped.push({ id, reason: 'derived argument is not a build-known scalar' });
			continue;
		}
		if (derivedSymbolIds(primary.plan).some((symbolId) => !bound?.[symbolId])) {
			skipped.push({ id, reason: 'derived symbol has no bound-symbol descriptor' });
			continue;
		}
		for (const [node, value] of Object.entries(initial)) initials[node] = value;
		if (bound) bounds[id] = bound;
		plans.push({ ...primary.plan, ...runnerSnapshot(primary.plan.node, context.state) });
		markup.push(primary.markup);
	}
	if (plans.length === 0) return { skipped };
	const plan = {
		version: 1 as const,
		boundaries: plans,
		...(Object.keys(bounds).length > 0 ? { bound: bounds } : {}),
		...(Object.keys(initials).length > 0 ? { initial: initials } : {}),
	};
	const planJson = JSON.stringify(plan);
	const templateHtml = markup.join('');
	const planScript = `<script type="markless/fill-plan">${planJson.replace(/<\/script/gi, '<\\/script')}</script>`;
	return {
		emission: {
			html: `${templateHtml}${planScript}`,
			planBytes: Buffer.byteLength(planScript, 'utf8'),
			templateBytes: Buffer.byteLength(templateHtml, 'utf8'),
			plan,
			skipped,
		},
		skipped,
	};
}

// The runner snapshot the server recorded for this boundary. Its key is what
// the boot calls the runner with; its version is what the settled snapshot the
// wake adopts must carry, so the runtime does not treat the value as stale.
function runnerSnapshot(
	node: string,
	state: unknown,
): { readonly key?: unknown; readonly version?: number } {
	const computed = (state as { readonly computed?: ReadonlyArray<Record<string, any>> } | undefined)
		?.computed;
	const snapshot = computed?.find((entry) => entry.graphNodeId === node)?.snapshot;
	if (!snapshot) return {};
	return {
		...('key' in snapshot ? { key: snapshot.key } : {}),
		...(typeof snapshot.version === 'number' ? { version: snapshot.version } : {}),
	};
}

function derivedSymbolIds(plan: ArmBoundaryPlan): ReadonlyArray<string> {
	return [...plan.holes, ...(plan.repeat?.holes ?? []), ...(plan.repeat?.emptyHoles ?? [])].flatMap(
		(hole) =>
			Array.isArray(hole.from) ? [] : [(hole.from as { readonly symbolId: string }).symbolId],
	);
}

/**
 * The scalar cells a derived hole reads besides the settled value. Returns
 * undefined when any of them is not a build-known scalar, which fails the whole
 * boundary closed: an unresolvable argument would fill the hole from nothing.
 */
function initialScalarsFor(
	plan: ArmBoundaryPlan,
	state: unknown,
): Record<string, unknown> | undefined {
	const cells = (state as { readonly cells?: ReadonlyArray<Record<string, any>> } | undefined)
		?.cells;
	const wanted = new Set(
		[...plan.holes, ...(plan.repeat?.holes ?? []), ...(plan.repeat?.emptyHoles ?? [])]
			.flatMap((hole) =>
				Array.isArray(hole.from)
					? []
					: ((hole.from as { readonly args?: ReadonlyArray<{ readonly node: string }> })
							.args ?? []),
			)
			.map((argument) => argument.node)
			.filter((node) => node !== plan.node),
	);
	const initial: Record<string, unknown> = {};
	for (const node of wanted) {
		const cell = cells?.find((candidate) => candidate.graphNodeId === node);
		const envelope = cell?.value as { readonly root?: unknown; readonly records?: unknown[] };
		if (!envelope || (envelope.records?.length ?? 0) > 0) return undefined;
		const root = envelope.root;
		if (root !== null && !['string', 'number', 'boolean'].includes(typeof root)) return undefined;
		initial[node] = root;
	}
	return initial;
}

function artifactSettleBound(
	page: SsrRenderable,
): Record<string, Record<string, unknown>> | undefined {
	return typeof page === 'object'
		? (
				page as {
					readonly prerenderBoot?: {
						readonly settle?: {
							readonly bound?: Record<string, Record<string, unknown>>;
						};
					};
				}
			).prerenderBoot?.settle?.bound
		: undefined;
}

type BoundaryRecords = {
	readonly runnerGraphNodeId: string;
	readonly armLocatorIndex: ReadonlyMap<string, number>;
	readonly domUpdates: ReadonlyArray<Record<string, any>>;
	readonly keyedRepeats: ReadonlyArray<Record<string, any>>;
	readonly branches: ReadonlyArray<unknown>;
	readonly computedByNode: ReadonlyMap<string, Record<string, any>>;
};

function boundaryRecords(output: SsrRenderOutput, boundaryId: string): BoundaryRecords {
	const view = output.view as any;
	const state = output.state as any;
	const boundary = (view?.asyncBoundaries ?? []).find((entry: any) => entry.id === boundaryId);
	if (!boundary) unsupported(`boundary records missing: ${boundaryId}`);
	const armRecords = boundary.armRecords;
	if (!armRecords || Array.isArray(armRecords))
		unsupported(`boundary is not composed-settled: ${boundaryId}`);
	const armLocatorIndex = new Map<string, number>();
	for (const locator of armRecords.locators ?? [])
		if (!armLocatorIndex.has(locator.hostNodeId))
			armLocatorIndex.set(locator.hostNodeId, locator.index);
	const pageUpdates = (view?.domUpdates ?? []).filter((update: any) =>
		armLocatorIndex.has(update.hostNodeId),
	);
	return {
		runnerGraphNodeId: boundary.runnerGraphNodeId,
		armLocatorIndex,
		domUpdates: [...pageUpdates, ...(armRecords.domUpdates ?? [])],
		keyedRepeats: armRecords.keyedRepeats ?? [],
		branches: armRecords.branches ?? [],
		computedByNode: new Map(
			(state?.computed ?? []).map((entry: any) => [entry.graphNodeId, entry]),
		),
	};
}

function armHtml(output: SsrRenderOutput, boundaryId: string): string {
	const anchor = (output.structure?.anchors ?? []).find(
		(candidate) => candidate.kind === 'async' && candidate.id === boundaryId,
	);
	if (!anchor) unsupported(`arm markup missing: ${boundaryId}`);
	return anchor.html;
}

function buildBoundary(
	probe: ProbeSet,
	sibling: ProbeSet,
	boundaryId: string,
): { readonly plan: ArmBoundaryPlan; readonly markup: string } {
	const records = boundaryRecords(probe.one.output, boundaryId);
	if (records.branches.length > 0)
		unsupported(`arm structure depends on data (branch in arm): ${boundaryId}`);
	if (records.keyedRepeats.length > 1) unsupported('more than one repeat in the arm');

	const htmlTwo = armHtml(probe.two.output, boundaryId);
	const htmlOne = armHtml(probe.one.output, boundaryId);
	const htmlNone = armHtml(probe.none.output, boundaryId);
	const repeat = records.keyedRepeats[0];
	const parts = repeat
		? reconstruct(htmlTwo, htmlOne, htmlNone, Number(repeat.rowElementCount ?? 0))
		: { prefix: htmlOne, row: '', suffix: '', empty: '' };
	if (!repeat && (htmlTwo !== htmlOne || htmlNone !== htmlOne))
		unsupported('arm markup varies by row count without a repeat record');

	const derived = derivedHoleSites(probe, sibling, boundaryId, records, parts);
	const counter = { next: 0 };
	const armHoles: Array<ArmHole> = [];
	const prefix = substituteHoles(parts.prefix, probe.one.minter, armHoles, counter, derived, 0);
	const rowAnchorCoordinate = repeat ? counter.next++ : -1;
	const suffix = substituteHoles(
		parts.suffix,
		probe.one.minter,
		armHoles,
		counter,
		derived,
		parts.prefix.length + parts.row.length,
	);
	const rowHoles: Array<ArmHole> = [];
	const row = repeat
		? substituteHoles(parts.row, probe.one.minter, rowHoles, counter, [], -1)
		: '';
	const emptyHoles: Array<ArmHole> = [];
	const empty = repeat
		? substituteHoles(parts.empty, probe.one.minter, emptyHoles, counter, [], -1)
		: '';

	const collectionPath: HolePath = repeat ? (repeat.collectionPath ?? []) : [];
	if (repeat && repeat.collectionGraphNodeId !== records.runnerGraphNodeId)
		unsupported('repeat collection is not the settled value');
	for (const hole of rowHoles) rebaseRowHole(hole, collectionPath);
	assertCoverage(records, [...armHoles, ...rowHoles, ...emptyHoles], repeat);

	const plan: ArmBoundaryPlan = {
		id: boundaryId,
		arm: 'try',
		node: records.runnerGraphNodeId,
		holes: armHoles,
		...(repeat
			? {
					repeat: {
						id: String(repeat.id),
						coordinate: rowAnchorCoordinate,
						from: collectionPath,
						holes: rowHoles,
						emptyHoles,
					},
				}
			: {}),
	};
	const escaped = `${escapeArmId(boundaryId)}`;
	const markup = [
		`<template m:arm="${escaped}">${prefix}${repeat ? holeAnchor(rowAnchorCoordinate) : ''}${suffix}</template>`,
		repeat ? `<template m:row="${escaped}">${row}</template>` : '',
		repeat ? `<template m:empty="${escaped}">${empty}</template>` : '',
	].join('');
	if (markup.includes(SENTINEL_OPEN)) unsupported('sentinel leaked into emitted markup');
	return { plan, markup };
}

function escapeArmId(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function holeAnchor(coordinate: number): string {
	return `<!--mh:${coordinate}-->`;
}

// prefix + row·n + suffix, proven by reconstruction: exactly one split of the
// one-row markup may rebuild the two-row markup, and the no-row markup must be
// the same prefix and suffix around the empty template.
function reconstruct(
	htmlTwo: string,
	htmlOne: string,
	htmlNone: string,
	rowElementCount: number,
): { prefix: string; row: string; suffix: string; empty: string } {
	const rowLength = htmlTwo.length - htmlOne.length;
	if (rowLength <= 0) unsupported('two-row markup is not longer than one-row markup');
	const candidates: Array<{ prefix: string; row: string; suffix: string }> = [];
	for (let split = 0; split + rowLength <= htmlOne.length; split++) {
		const prefix = htmlOne.slice(0, split);
		const row = htmlOne.slice(split, split + rowLength);
		const suffix = htmlOne.slice(split + rowLength);
		if (`${prefix}${row}${row}${suffix}` !== htmlTwo) continue;
		// Rotations of the row rebuild the same document; only the split that
		// starts a row element and holds the recorded row element count is the
		// row the compiler described.
		if (!row.startsWith('<')) continue;
		if ((row.match(/<[A-Za-z]/g) ?? []).length !== rowElementCount) continue;
		candidates.push({ prefix, row, suffix });
	}
	if (candidates.length !== 1)
		unsupported(`row reconstruction is not unique (${candidates.length} splits)`);
	const { prefix, row, suffix } = candidates[0]!;
	if (!htmlNone.startsWith(prefix) || !htmlNone.endsWith(suffix))
		unsupported('empty markup does not share the reconstructed prefix and suffix');
	const empty = htmlNone.slice(prefix.length, htmlNone.length - suffix.length);
	return { prefix, row, suffix, empty };
}

type DerivedSite = {
	readonly start: number;
	readonly end: number;
	readonly hole: Omit<ArmHole, 'coordinate'>;
};

// A residue the sentinel cannot carry (arithmetic over settled data) survives as
// a literal. Two probes move that literal and nothing else, so the differing
// span locates it; the compiled derive symbol then expresses it as a hole.
function derivedHoleSites(
	probe: ProbeSet,
	sibling: ProbeSet,
	boundaryId: string,
	records: BoundaryRecords,
	parts: { prefix: string; row: string; suffix: string },
): ReadonlyArray<DerivedSite> {
	const derivedUpdates = records.domUpdates.filter((update) => {
		const computed = records.computedByNode.get(update.graphNodeId);
		return !!computed?.deriveSymbolId;
	});
	if (derivedUpdates.length === 0) return [];
	if (derivedUpdates.length > 1) unsupported('more than one derived residue in the arm');
	const update = derivedUpdates[0]!;
	const computed = records.computedByNode.get(update.graphNodeId)!;
	const other = armHtml(sibling.one.output, boundaryId);
	const html = armHtml(probe.one.output, boundaryId);
	if (html === other) unsupported('derived residue did not move between probes');
	let head = 0;
	while (head < html.length && html[head] === other[head]) head++;
	let tail = 0;
	while (
		tail < html.length - head &&
		tail < other.length - head &&
		html[html.length - 1 - tail] === other[other.length - 1 - tail]
	)
		tail++;
	const region = expandRegion(html, head, html.length - tail);
	const ordinal = elementOrdinalAt(html, region.start);
	const expected = records.armLocatorIndex.get(update.hostNodeId);
	if (expected === undefined || expected !== ordinal)
		unsupported('derived residue is not inside its recorded host element');
	const target = update.target ?? {};
	if (target.kind !== 'text')
		unsupported(`derived residue target is not expressible: ${String(target.kind)}`);
	const prefixText = String(target.prefix ?? '');
	if (!html.slice(region.start, region.end).startsWith(prefixText))
		unsupported('derived text residue does not follow its recorded prefix');
	const start = region.start + prefixText.length;
	if (start >= parts.prefix.length && start < parts.prefix.length + parts.row.length)
		unsupported('derived residue lands inside a repeat row');
	return [
		{
			start,
			end: region.end,
			hole: {
				kind: 'text',
				from: {
					symbolId: String(computed.deriveSymbolId),
					args: (computed.dependencies ?? []).map((dependency: any) => ({
						node: String(dependency.graphNodeId),
						path: (dependency.path ?? []) as HolePath,
					})),
				},
			},
		},
	];
}

// Widen a differing span to the text node or attribute value that holds it.
function expandRegion(
	html: string,
	start: number,
	end: number,
): { start: number; end: number; attributeName?: string } {
	let left = start;
	while (left > 0 && html[left - 1] !== '>' && html[left - 1] !== '"') left--;
	let right = end;
	while (right < html.length && html[right] !== '<' && html[right] !== '"') right++;
	if (html[left - 1] === '"') {
		const name = /([A-Za-z_:][-A-Za-z0-9_:.]*)="$/.exec(html.slice(0, left))?.[1];
		if (!name) unsupported('attribute residue has no attribute name');
		return { start: left, end: right, attributeName: name };
	}
	return { start: left, end: right };
}

function elementOrdinalAt(html: string, index: number): number {
	const head = html.slice(0, index);
	return (head.match(/<[A-Za-z]/g) ?? []).length - 1;
}

function substituteHoles(
	source: string,
	minter: Minter,
	holes: Array<ArmHole>,
	counter: { next: number },
	derived: ReadonlyArray<DerivedSite>,
	offset: number,
): string {
	SENTINEL_PATTERN.lastIndex = 0;
	const sites: Array<{ start: number; end: number; hole: Omit<ArmHole, 'coordinate'> }> = [];
	for (const match of source.matchAll(SENTINEL_PATTERN)) {
		const index = match.index!;
		const path = minter.paths[Number(match[1])];
		if (!path) unsupported('unknown sentinel');
		const attribute = /([A-Za-z_:][-A-Za-z0-9_:.]*)="$/.exec(source.slice(0, index))?.[1];
		sites.push({
			start: index,
			end: index + match[0].length,
			hole: {
				kind: attribute ? 'attribute' : 'text',
				...(attribute ? { name: attribute } : {}),
				from: path,
			},
		});
	}
	for (const site of derived) {
		if (offset < 0) continue;
		const start = site.start - offset;
		const end = site.end - offset;
		if (start < 0 || end > source.length) continue;
		sites.push({ start, end, hole: site.hole });
	}
	sites.sort((left, right) => left.start - right.start);

	let result = '';
	let cursor = 0;
	for (const site of sites) {
		const coordinate = counter.next++;
		holes.push({ ...site.hole, coordinate } as ArmHole);
		if (site.hole.kind === 'attribute') {
			// A comment cannot live inside an attribute value, so the anchor sits
			// immediately before the owning element and the value ships empty.
			const elementStart = source.lastIndexOf('<', site.start);
			if (elementStart < cursor) unsupported('attribute hole outside the working segment');
			result += `${source.slice(cursor, elementStart)}${holeAnchor(coordinate)}${source.slice(elementStart, site.start)}`;
		} else {
			result += `${source.slice(cursor, site.start)}${holeAnchor(coordinate)}`;
		}
		cursor = site.end;
	}
	return `${result}${source.slice(cursor)}`;
}

function rebaseRowHole(hole: ArmHole, collectionPath: HolePath): void {
	if (!Array.isArray(hole.from)) unsupported('derived residue inside a repeat row');
	const path = hole.from as HolePath;
	const marker = [...collectionPath, '[]'];
	for (let index = 0; index < marker.length; index++)
		if (path[index] !== marker[index]) unsupported('row hole is not item-relative');
	(hole as { from: HolePath }).from = path.slice(marker.length);
}

// Every settled-data residue the records name must have become a hole. An
// unmatched record is a residue this design cannot express: no plan.
function assertCoverage(
	records: BoundaryRecords,
	holes: ReadonlyArray<ArmHole>,
	repeat: Record<string, any> | undefined,
): void {
	const pathHoles = new Set(
		holes.filter((hole) => Array.isArray(hole.from)).map((hole) => (hole.from as HolePath).join('.')),
	);
	const derivedHoles = new Set(
		holes
			.filter((hole) => !Array.isArray(hole.from))
			.map((hole) => (hole.from as { symbolId: string }).symbolId),
	);
	for (const update of records.domUpdates) {
		const computed = records.computedByNode.get(update.graphNodeId);
		if (computed?.deriveSymbolId) {
			if (!derivedHoles.has(String(computed.deriveSymbolId)))
				unsupported(`derived residue without a hole: ${update.graphNodeId}`);
			continue;
		}
		if (update.graphNodeId !== records.runnerGraphNodeId) continue;
		const path = (update.path ?? []) as HolePath;
		if (!pathHoles.has(path.join('.')) && !pathHoles.has(path.slice(-1).join('.')))
			unsupported(`settled residue without a hole: ${update.source}`);
	}
	if (repeat && !repeat.collectionPath) unsupported('repeat without a collection path');
}

export async function withBuiltPrerenderPage<T>(
	input: { readonly entry: string; readonly serverPlugin: Plugin },
	read: (page: SsrRenderable) => Promise<T>,
): Promise<T> {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), 'markless-prerender-'));
	try {
		const { rolldown } = await import('rolldown');
		const build = await rolldown({
			input: { prerender: input.entry },
			plugins: [input.serverPlugin],
		});
		await build.write({
			dir: temporaryDirectory,
			format: 'esm',
			entryFileNames: '[name].js',
			chunkFileNames: 'chunk-[hash].js',
		});
		await build.close();

		const moduleUrl = `${pathToFileURL(join(temporaryDirectory, 'prerender.js')).href}?build=${Date.now()}`;
		const built = (await import(moduleUrl)) as { readonly default?: SsrRenderable };
		if (!built.default) throw new Error('MARKLESS_PRERENDER_ENTRY_MISSING');
		return await read(built.default);
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}
