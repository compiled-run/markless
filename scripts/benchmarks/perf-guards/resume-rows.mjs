// G13: resume data each list row adds to the served html, on a fixture rendered at two row counts.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { resumeDataBreakdown } from '../resume-data/breakdown.mjs';
import { ROOT_DIR } from './config.mjs';

const exec = promisify(execFile);
export const RESUME_ROWS_FIXTURE = join(ROOT_DIR, 'packages/bundler/fixtures/vite-ssr-resume-rows');

// Each shape renders at two row counts with everything but the rows held constant.
const SHAPES = {
	'keyed rows': {
		small: ['Keyed', { props: { count: 10 } }],
		large: ['Keyed', { props: { count: 20 } }],
		rows: 10,
	},
	'fixed row slots': { small: ['Slots8'], large: ['Slots16'], rows: 8 },
};

export async function measureResumeRows({ build = true } = {}) {
	const entry = join(RESUME_ROWS_FIXTURE, 'dist/server-render/server.js');
	if (build || !existsSync(entry)) {
		await rm(join(RESUME_ROWS_FIXTURE, 'dist'), { force: true, recursive: true });
		await exec(join(ROOT_DIR, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: RESUME_ROWS_FIXTURE,
			maxBuffer: 64 * 1024 * 1024,
		});
	}
	const server = await import(`${pathToFileURL(entry).href}?t=${Date.now()}`);
	const out = {};
	for (const [shape, { small, large, rows }] of Object.entries(SHAPES)) {
		const before = resumeDataBreakdown(await server.render(...small));
		const after = resumeDataBreakdown(await server.render(...large));
		const records = (data) =>
			Object.values(data.lists).reduce((total, list) => total + list.records, 0);
		out[shape] = {
			rows,
			bytesPerRow: Math.round((after.total.raw - before.total.raw) / rows),
			gzipBytesPerRow: Math.round((after.total.gzip - before.total.gzip) / rows),
			recordsPerRow: Math.round((records(after) - records(before)) / rows),
			resumeBytes: after.total.raw,
		};
	}
	return out;
}
