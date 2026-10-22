// Child process: generates the app, builds it, and prints one JSON line with what it measured.
// Run alone so its peak resident memory is this build's and nothing else's.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { writeHeapSnapshot } from 'node:v8';
import { createBuilder } from 'vite';
import { markless } from '../../../packages/core/src/vite.ts';
import { router } from '../../../packages/router/src/vite/index.ts';
import { generateBuildScaleApp } from './generate.mjs';

const { values } = parseArgs({
	options: {
		dir: { type: 'string' },
		pages: { type: 'string' },
		components: { type: 'string' },
		layers: { type: 'string' },
		'layer-bytes': { type: 'string' },
	},
});
const app = await generateBuildScaleApp({
	dir: values.dir,
	pages: Number(values.pages),
	...(values.components ? { components: Number(values.components) } : {}),
	...(values.layers ? { layers: Number(values.layers) } : {}),
	...(values['layer-bytes'] ? { layerBytes: Number(values['layer-bytes']) } : {}),
});

let peakHeap = 0;
let peakHeapTotal = 0;
let peakExternal = 0;
const sampler = setInterval(() => {
	const usage = process.memoryUsage();
	peakHeap = Math.max(peakHeap, usage.heapUsed);
	peakHeapTotal = Math.max(peakHeapTotal, usage.heapTotal);
	peakExternal = Math.max(peakExternal, usage.external);
}, 50);
// With --expose-gc, the heap each build phase still holds after a full collection: what a phase retains, not its garbage.
const retained = [];
const retainedAt = (phase) =>
	function () {
		if (typeof globalThis.gc !== 'function') return;
		globalThis.gc();
		retained.push({
			environment: this.environment?.name,
			phase,
			heapBytes: process.memoryUsage().heapUsed,
			rssBytes: process.memoryUsage().rss,
		});
		if (process.env.BUILD_SCALE_SNAPSHOT === `${this.environment?.name}:${phase}`)
			writeHeapSnapshot(join(app.dir, `${this.environment?.name}-${phase}.heapsnapshot`));
	};
const phases = ['buildStart', 'buildEnd', 'renderStart', 'generateBundle', 'writeBundle'];
const retainedHeapPlugin = {
	name: 'build-scale-retained-heap',
	...Object.fromEntries(
		phases.map((phase) => [phase, { order: 'post', handler: retainedAt(phase) }]),
	),
};
const started = performance.now();
const cpuBefore = process.cpuUsage();
const builder = await createBuilder({
	root: app.dir,
	configFile: false,
	logLevel: 'silent',
	plugins: [markless(), router(), retainedHeapPlugin],
});
await builder.buildApp();
const seconds = (performance.now() - started) / 1000;
const buildCpu = process.cpuUsage(cpuBefore);
clearInterval(sampler);

async function files(directory) {
	const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(
		() => [],
	);
	const out = [];
	for (const entry of entries)
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			out.push({ path: path.slice(app.dir.length + 1), bytes: (await stat(path)).size });
		}
	return out;
}
const largest = (list, test) =>
	list.filter((file) => test(file.path)).sort((a, b) => b.bytes - a.bytes)[0] ?? null;
const output = await files(join(app.dir, '.output'));
const isCode = (path) => /\.m?js$/.test(path);
console.log(
	JSON.stringify({
		...app,
		seconds: Math.round(seconds * 10) / 10,
		cpuSeconds: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1e5) / 10,
		// CPU of the build alone, every thread of this process: what the build-time budgets read.
		buildCpuSeconds: Math.round((buildCpu.user + buildCpu.system) / 1e4) / 100,
		// maxRSS is reported in kilobytes.
		peakRssBytes: process.resourceUsage().maxRSS * 1024,
		peakHeapBytes: peakHeap,
		peakHeapTotalBytes: peakHeapTotal,
		peakExternalBytes: peakExternal,
		...(retained.length ? { retained } : {}),
		largestServerChunk: largest(
			output,
			(path) => isCode(path) && path.startsWith('.output/server/'),
		),
		largestClientChunk: largest(
			output,
			(path) => isCode(path) && path.startsWith('.output/public/'),
		),
		largestArtifact: largest(output, (path) => path.endsWith('.json')),
	}),
);
