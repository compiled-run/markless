// A runner's first Chrome launch reads the install cold (24.8 s under build IO vs 144 ms warm); pay it before a harness's 30 s launch window.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const candidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser'];
const chrome = candidates.find(
	(name) => spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0,
);
if (!chrome) {
	console.log(`warm-chrome: none of ${candidates.join(', ')} is on PATH; nothing to warm.`);
	process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'warm-chrome-'));
const started = performance.now();
const result = spawnSync(
	chrome,
	[
		'--headless=new',
		'--no-first-run',
		'--no-default-browser-check',
		`--user-data-dir=${profile}`,
		'--dump-dom',
		'about:blank',
	],
	{ stdio: ['ignore', 'ignore', 'pipe'] },
);
rmSync(profile, { recursive: true, force: true });
if (result.status !== 0) {
	console.error(`warm-chrome: ${chrome} exited ${result.status}\n${result.stderr}`);
	process.exit(1);
}
console.log(`warm-chrome: ${chrome} launched in ${Math.round(performance.now() - started)} ms`);
