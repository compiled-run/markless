import { execSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-vercel';

function buildId() {
	if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return 'unknown';
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x', regions: ['iad1'] }),
		version: { name: buildId() }
	}
};

export default config;
