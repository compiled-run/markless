#!/usr/bin/env node
// Whether the benchmark app built from the baseline checkout and from the current one serve the same
// bytes. Both sides build the same fixture, so when every emitted file matches, once the checkout's
// own location is written out of the build reports, no benchmark can measure a difference.
//
// Usage: node scripts/benchmarks/jsfb-bundle-digest.mjs digest <dist dir> <markless root> > side.json
//        node scripts/benchmarks/jsfb-bundle-digest.mjs compare <baseline.json> <current.json>
import { createHash } from 'node:crypto';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT_PLACEHOLDER = '<markless-root>';

/** sha256 of every file under `dist`, with `root` (absolute, and relative to the app) replaced. */
export function bundleDigest(dist, root) {
	const app = path.dirname(path.resolve(dist));
	const spellings = [path.resolve(root), path.relative(app, path.resolve(root))]
		.filter((spelling) => spelling !== '' && spelling !== '.')
		.toSorted((left, right) => right.length - left.length);
	const files = {};
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) {
				let text = readFileSync(full).toString('latin1');
				for (const spelling of spellings)
					text = text.replaceAll(spelling, ROOT_PLACEHOLDER);
				files[path.relative(dist, full).split(path.sep).join('/')] = createHash('sha256')
					.update(text, 'latin1')
					.digest('hex');
			}
		}
	};
	walk(dist);
	return Object.fromEntries(
		Object.entries(files).toSorted(([left], [right]) => (left < right ? -1 : 1)),
	);
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
