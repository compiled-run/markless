#!/usr/bin/env node
// Whether the benchmark app built from the baseline checkout and from the current one serve the same
// bytes. Both sides build the same fixture, so when every emitted file matches, once the checkout's
// own location and the content hashes in chunk file names are written out, no benchmark can measure a
// difference.
//
// Usage: node scripts/benchmarks/jsfb-bundle-digest.mjs digest <dist dir> <markless root> > side.json
//        node scripts/benchmarks/jsfb-bundle-digest.mjs compare <baseline.json> <current.json>
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { marklessBuildManifestPath } from '../../packages/bundler/src/build/build-manifests.ts';
import {
	MARKLESS_BUILD_PREFIX,
	MARKLESS_BYTE_ATTRIBUTION,
} from '../../packages/bundler/src/build/chunking.ts';

const ROOT_PLACEHOLDER = '<markless-root>';

const sha256 = (text) => createHash('sha256').update(text, 'latin1').digest('hex');

/** sha256 of every file under `dist`, with `root` replaced and content-hashed chunk names made stable. */
export function bundleDigest(dist, root) {
	const app = path.dirname(path.resolve(dist));
	const spellings = [path.resolve(root), path.relative(app, path.resolve(root))]
		.filter((spelling) => spelling !== '' && spelling !== '.')
		.toSorted((left, right) => right.length - left.length);
	const texts = new Map();
	const sizes = new Map();
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) {
				const bytes = readFileSync(full);
				let text = bytes.toString('latin1');
				for (const spelling of spellings)
					text = text.replaceAll(spelling, ROOT_PLACEHOLDER);
				const file = path.relative(dist, full).split(path.sep).join('/');
				texts.set(file, text);
				sizes.set(file, bytes.length);
			}
		}
	};
	walk(dist);
	const stable = stableChunkNames(dist, texts, sizes);
	const files = {};
	for (const [file, text] of texts) {
		const name = path.posix.basename(file);
		const key = stable.has(name)
			? path.posix.join(path.posix.dirname(file), stable.get(name))
			: file;
		files[key] = sha256(renamed(text, stable));
	}
	return Object.fromEntries(
		Object.entries(files).toSorted(([left], [right]) => (left < right ? -1 : 1)),
	);
}

function renamed(text, stable) {
	for (const [from, to] of [...stable].toSorted(([left], [right]) => right.length - left.length))
		text = text.replaceAll(from, to);
	return text;
}

// A module ships in one chunk, so the bundler's per-chunk module list names it without its hash, even
// across import cycles; a module-free facade is named by its bytes. Unnameable chunks keep the hash.
function stableChunkNames(dist, texts, sizes) {
	const metadata = marklessBuildManifestPath(path.resolve(dist), MARKLESS_BYTE_ATTRIBUTION);
	if (!existsSync(metadata)) return new Map();
	const chunks = new Map();
	for (const [name, chunk] of Object.entries(
		JSON.parse(readFileSync(metadata, 'utf8')).chunks ?? {},
	)) {
		const files = [`${MARKLESS_BUILD_PREFIX}${name}`, name].filter((file) => texts.has(file));
		// Metadata left by an earlier build names other files or sizes: trust none of it.
		if (files.length !== 1 || sizes.get(files[0]) !== chunk.bytes) return new Map();
		chunks.set(path.posix.basename(files[0]), {
			text: texts.get(files[0]),
			modules: chunk.modules,
		});
	}
	const stable = new Map();
	const claim = (ids) => {
		const taken = [...ids.values()];
		for (const [name, id] of ids)
			if (taken.indexOf(id) === taken.lastIndexOf(id)) stable.set(name, id);
	};
	const carriers = [...chunks].filter(([, chunk]) => chunk.modules.length > 0);
	claim(
		new Map(
			carriers.map(([name, { modules }]) => {
				const keys = modules.map(([category, key]) => `${category}:${key}`);
				return [name, `[${keys[0]} ${sha256(keys.join('\n')).slice(0, 12)}].js`];
			}),
		),
	);
	let facades = [...chunks.keys()].filter(
		(name) => !stable.has(name) && chunks.get(name).modules.length === 0,
	);
	while (facades.length > 0) {
		const ready = facades.filter((name) =>
			[...chunks.keys()].every(
				(other) =>
					other === name || stable.has(other) || !chunks.get(name).text.includes(other),
			),
		);
		if (ready.length === 0) break;
		claim(
			new Map(
				ready.map((name) => [
					name,
					`[facade ${sha256(renamed(chunks.get(name).text, stable)).slice(0, 12)}].js`,
				]),
			),
		);
		facades = facades.filter((name) => !ready.includes(name));
	}
	return stable;
}

/** The files whose bytes differ between two digests, or that only one side emitted. */
export function bundleDifferences(baseline, current) {
	const names = new Set([...Object.keys(baseline), ...Object.keys(current)]);
	return [...names].toSorted().filter((name) => baseline[name] !== current[name]);
}

function main([command, first, second]) {
	if (command === 'digest' && first && second) {
		process.stdout.write(`${JSON.stringify(bundleDigest(first, second), null, '\t')}\n`);
		return 0;
	}
	if (command === 'compare' && first && second) {
		const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
		const baseline = read(first);
		const differences = bundleDifferences(baseline, read(second));
		const identical = differences.length === 0 && Object.keys(baseline).length > 0;
		console.log(
			identical
				? `The benchmark app's ${Object.keys(baseline).length} built files are byte-identical to the baseline's, so no benchmark can measure a change.`
				: `The benchmark app's build differs from the baseline's in: ${differences.join(', ') || 'nothing was built'}`,
		);
		console.log(`identical=${identical}`);
		if (process.env.GITHUB_OUTPUT)
			appendFileSync(process.env.GITHUB_OUTPUT, `identical=${identical}\n`);
		return 0;
	}
	console.error(
		'usage: jsfb-bundle-digest.mjs digest <dist dir> <markless root> | compare <baseline.json> <current.json>',
	);
	return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
