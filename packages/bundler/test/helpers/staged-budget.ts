import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { resolve } from 'pathe';
import { MARKLESS_BUILD_PREFIX, MARKLESS_BUNDLE_GRAPH } from '../../src/build/chunking.ts';
import { MARKLESS_EXECUTION_SIZES } from '../../src/build/execution-sizes.ts';
import { parseBundleGraph, type ParsedBundleGraphRecord } from '../../src/build/preload-plan.ts';
import type { MarklessBundleGraph } from '../../src/types.ts';

const exec = promisify(execFile);

export type StageAnchor = { readonly gzipBytes: number; readonly margin: number };

export type StageMeasurement = {
	readonly stage: string;
	readonly what: string;
	readonly chunks: readonly string[];
	readonly gzipBytes: number;
};

export type BudgetMeasurement = {
	readonly stages: readonly StageMeasurement[];
	readonly aggregate: { readonly chunks: number; readonly gzipBytes: number };
	readonly instrumented: readonly unknown[];
};

export function stageOverruns(
	stages: readonly StageMeasurement[],
	anchors: Record<string, StageAnchor>,
): string[] {
	const overruns: string[] = [];
	for (const stage of stages) {
		const anchor = anchors[stage.stage];
		if (!anchor) {
			overruns.push(`${stage.stage}: measured ${stage.gzipBytes} gzip bytes with no anchor`);
			continue;
		}
		const ceiling = anchor.gzipBytes + anchor.margin;
		if (stage.gzipBytes <= ceiling) continue;
		overruns.push(
			`${stage.stage}: measured ${stage.gzipBytes} gzip bytes across ${stage.chunks.length} chunks, over anchor ${anchor.gzipBytes} (+${anchor.margin} margin) = ${ceiling}`,
		);
	}
	return overruns;
}

export function stageReport(input: {
	readonly title: string;
	readonly budget: BudgetMeasurement;
	readonly anchors: Record<string, StageAnchor>;
	readonly aggregateNote: string;
}): string {
	const lines = input.budget.stages.map((stage) => {
		const anchor = input.anchors[stage.stage];
		return `  ${stage.stage}: ${stage.gzipBytes} gzip bytes across ${stage.chunks.length} chunks (anchor ${anchor?.gzipBytes ?? '-'} +${anchor?.margin ?? '-'}) - ${stage.what}`;
	});
	return [input.title, ...lines, `  ${input.aggregateNote}`].join('\n');
}

// The ladder is cumulative: a marginal stage is charged only for the chunks no
// earlier stage already pulled in. A standalone stage is measured whole and
// leaves the cumulative set untouched.
export function createStageLadder(sum: (chunks: Iterable<string>) => number): {
	readonly stages: StageMeasurement[];
	standalone(stage: string, what: string, chunks: Iterable<string>): void;
	marginal(stage: string, what: string, chunks: Iterable<string>): void;
} {
	const stages: StageMeasurement[] = [];
	const pulled = new Set<string>();
	return {
		stages,
		standalone(stage, what, chunks) {
			stages.push({ stage, what, chunks: [...chunks].sort(), gzipBytes: sum(chunks) });
		},
		marginal(stage, what, chunks) {
			const marginal = [...chunks].filter((chunk) => !pulled.has(chunk)).sort();
			for (const chunk of marginal) pulled.add(chunk);
			stages.push({ stage, what, chunks: marginal, gzipBytes: sum(marginal) });
		},
	};
}

export function staticClosure(
	graph: ReadonlyMap<string, ParsedBundleGraphRecord>,
	roots: Iterable<string>,
): Set<string> {
	const seen = new Set<string>();
	const chunks = new Set<string>();
	const pending = [...roots];
	while (pending.length > 0) {
		const name = pending.pop()!;
		if (seen.has(name)) continue;
		seen.add(name);
		if (JS_CHUNK_NAME.test(name)) chunks.add(name);
		for (const dep of graph.get(name)?.deps ?? []) {
			if (dep.kind === 'static') pending.push(dep.name);
		}
	}
	return chunks;
}

// A woken symbol costs one dynamic hop (its own chunk, plus whatever the
// runtime demand map routes it to) and then everything those import statically.
export function wakeClosure(
	graph: ReadonlyMap<string, ParsedBundleGraphRecord>,
	symbolIds: readonly string[],
): Set<string> {
	return staticClosure(
		graph,
		symbolIds.flatMap((symbolId) => (graph.get(symbolId)?.deps ?? []).map((dep) => dep.name)),
	);
}

export type ClientBuildArtifacts = {
	readonly aggregateChunks: readonly string[];
	readonly graph: ReadonlyMap<string, ParsedBundleGraphRecord>;
	readonly instrumented: readonly unknown[];
};

export async function readClientBuildArtifacts(publicDir: string): Promise<ClientBuildArtifacts> {
	const sizes = JSON.parse(
		await readFile(resolve(publicDir, MARKLESS_EXECUTION_SIZES), 'utf8'),
	) as Record<string, { readonly chunk?: string; readonly instrument?: true }>;
	const aggregateChunks = [
		...new Set(
			Object.values(sizes)
				.map((entry) => entry.chunk)
				.filter(isString),
		),
	].sort();
	const graph = parseBundleGraph(
		JSON.parse(
			await readFile(resolve(publicDir, MARKLESS_BUNDLE_GRAPH), 'utf8'),
		) as MarklessBundleGraph,
	);
	return {
		aggregateChunks,
		graph,
		instrumented: Object.values(sizes).filter((entry) => entry.instrument),
	};
}

export function gzipByChunk(buildDir: string): (name: string) => number {
	const cache = new Map<string, number>();
	return (name: string) => {
		const cached = cache.get(name);
		if (cached !== undefined) return cached;
		const bytes = gzipSync(readFileSync(resolve(buildDir, name)), { level: 9 }).length;
		cache.set(name, bytes);
		return bytes;
	};
}

export type ScriptTag = { readonly attributes: string; readonly body: string };

// The SSR lane serves quoted attributes; the client lane's prerendered
// index.html is emitted with unquoted ones, so both forms have to parse.
const MODULEPRELOAD_LINK =
	/<link\b[^>]*\brel=(?:"modulepreload"|'modulepreload'|modulepreload(?=[\s/>]))[^>]*\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const SCRIPT_SRC = /\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/;
export const RESUME_MODULE_ATTRIBUTE = /\bdata-markless-resume-module="([^"]+)"/;
export const ROUTER_LINK_RESUMER_ATTRIBUTE = /\bdata-markless-router-link-resumer\b/;
const JS_CHUNK_NAME = /\.js$/;

export function scriptTags(html: string): ScriptTag[] {
	return [...html.matchAll(SCRIPT_TAG)].map((match) => ({
		attributes: match[1] ?? '',
		body: match[2] ?? '',
	}));
}

export function scriptSrc(script: ScriptTag): string | undefined {
	const match = SCRIPT_SRC.exec(script.attributes);
	return match ? attributeValue(match) : undefined;
}

// Every JS file the page makes the browser fetch before any interaction:
// modulepreload hints plus whatever a script tag names outright.
export function eagerChunkNames(html: string, scripts: readonly ScriptTag[]): string[] {
	const eager = new Set<string>();
	for (const match of html.matchAll(MODULEPRELOAD_LINK))
		eager.add(chunkName(attributeValue(match)));
	for (const script of scripts) {
		const src = scriptSrc(script);
		if (src) eager.add(chunkName(src));
	}
	return [...eager];
}

export function payloadScript(scripts: readonly ScriptTag[], type: string): string {
	const script = scripts.find((item) => item.attributes.includes(`type="${type}"`));
	if (!script) throw new Error(`served page carries no ${type} payload`);
	return `<script type="${type}">${script.body}</script>`;
}

export function importedChunkNames(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(/["'`]([^"'`]*\.js)["'`]/g)) {
		if (match[1]!.includes(MARKLESS_BUILD_PREFIX)) names.push(chunkName(match[1]!));
	}
	return names;
}

export function chunkName(href: string): string {
	return href.slice(href.lastIndexOf('/') + 1);
}

export async function renderServedPage(demo: string): Promise<string> {
	const port = await freePort();
	const server = spawn(process.execPath, [resolve(demo, '.output/server/index.mjs')], {
		cwd: demo,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	const collect = (chunk: Buffer) => {
		output += chunk.toString();
	};
	server.stdout?.on('data', collect);
	server.stderr?.on('data', collect);
	try {
		const response = await servedPageResponse(server, port, () => output);
		return await response.text();
	} finally {
		server.kill('SIGKILL');
	}
}

export async function execPnpm(
	cwd: string,
	args: string[],
	env: Record<string, string> = {},
): Promise<void> {
	try {
		await exec('pnpm', args, { cwd, env: { ...process.env, ...env } });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}

async function servedPageResponse(
	server: ChildProcess,
	port: number,
	output: () => string,
): Promise<Response> {
	const url = `http://127.0.0.1:${port}/`;
	const deadline = Date.now() + 60_000;
	let last = '';
	while (Date.now() < deadline) {
		if (server.exitCode !== null)
			throw new Error(`built server exited with ${server.exitCode}: ${output()}`);
		try {
			const response = await fetch(url);
			if (response.ok) return response;
			last = `answered / with ${response.status}`;
		} catch (error) {
			last = (error as Error).message;
		}
		await new Promise((settle) => setTimeout(settle, 250));
	}
	throw new Error(`built server never served ${url} (${last}): ${output()}`);
}

function freePort(): Promise<number> {
	return new Promise((settle, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			if (address === null || typeof address === 'string') {
				probe.close();
				fail(new Error('could not reserve a port for the built server'));
				return;
			}
			probe.close(() => settle(address.port));
		});
	});
}

// An unquoted attribute value runs to the tag's whitespace; a trailing slash
// there belongs to the self-closing tag, not to the href.
function attributeValue(match: RegExpMatchArray): string {
	const value = match[1] ?? match[2] ?? match[3]!;
	return match[1] === undefined && match[2] === undefined ? value.replace(/\/$/, '') : value;
}

function isString(value: string | undefined): value is string {
	return value !== undefined;
}
