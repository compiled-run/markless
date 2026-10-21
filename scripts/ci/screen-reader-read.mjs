// Reads one shard of families with a real screen reader and keeps the transcript.
//
//   READER_PROJECT=voiceover FAMILIES="checkbox tabs" TRANSCRIPT=out.txt node scripts/ci/screen-reader-read.mjs
//
// One Playwright run per shard, so the runner pays for setup once. Exits with
// Playwright's own code: a family that failed fails the shard.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const project = process.env.READER_PROJECT;
const families = (process.env.FAMILIES ?? '').split(/\s+/).filter(Boolean);
const transcript = process.env.TRANSCRIPT;

if (!project || families.length === 0 || !transcript) {
	console.error('READER_PROJECT, FAMILIES and TRANSCRIPT are all required.');
	process.exit(1);
}

mkdirSync(dirname(transcript), { recursive: true });
const out = createWriteStream(transcript);
const specs = families.map((family) => `${family}/${family}.${project}.ts`);
const child = spawn('pnpm', ['test:sr-real', `--project=${project}`, ...specs], {
	stdio: ['ignore', 'pipe', 'pipe'],
	shell: process.platform === 'win32',
});
for (const stream of [child.stdout, child.stderr]) {
	stream.on('data', (chunk) => {
		process.stdout.write(chunk);
		out.write(chunk);
	});
}
child.on('close', (code) => {
	out.end(() => process.exit(code ?? 1));
});
