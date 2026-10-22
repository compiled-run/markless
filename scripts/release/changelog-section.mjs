#!/usr/bin/env node
// The CHANGELOG.md section a GitHub Release carries. No dependencies, so release.yml's announce job
// can run it on a bare checkout of the tag.
//
// Usage: node scripts/release/changelog-section.mjs <version> <out file>
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** The released section for `version` out of CHANGELOG.md, heading excluded. */
export function sectionBody(changelog, version) {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	return `${lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim()}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [version, out] = process.argv.slice(2);
	if (!version || !out) {
		console.error('usage: node scripts/release/changelog-section.mjs <version> <out file>');
		process.exit(1);
	}
	try {
		writeFileSync(out, sectionBody(readFileSync('CHANGELOG.md', 'utf8'), version));
	} catch (error) {
		console.error(`changelog-section: ${error.message}`);
		process.exit(1);
	}
}
