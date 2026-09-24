#!/usr/bin/env node
// Copies shared fixtures into one entrant app so apps never import across their own root.
// Usage: node shared/sync.mjs <appDir> [destRelative=src/shared] [--check]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sharedDir = dirname(fileURLToPath(import.meta.url));
const FILES = [
	{ name: 'data.ts', comment: (text) => `// ${text}` },
	{ name: 'styles.css', comment: (text) => `/* ${text} */` },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const positional = args.filter((arg) => arg !== '--check');
if (positional.length < 1 || positional.length > 2) {
	console.error('usage: node demos/interaction-benchmark/shared/sync.mjs <appDir> [destRelative=src/shared] [--check]');
	process.exit(2);
}
const appDir = resolve(positional[0]);
const destDir = resolve(appDir, positional[1] ?? 'src/shared');

function render(file) {
	const source = readFileSync(join(sharedDir, file.name), 'utf8');
	const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
	const header = file.comment(
		`GENERATED from demos/interaction-benchmark/shared/${file.name} (sha256:${hash}) by shared/sync.mjs. Do not edit; edit the source and re-sync.`,
	);
	return `${header}\n${source}`;
}

let drift = 0;
if (!check) mkdirSync(destDir, { recursive: true });
for (const file of FILES) {
	const target = join(destDir, file.name);
	const content = render(file);
	if (check) {
		const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
		if (current !== content) {
			drift++;
			console.error(`out of date: ${target}`);
		}
		continue;
	}
	writeFileSync(target, content);
	console.log(`wrote ${target}`);
}
if (drift > 0) process.exit(1);
