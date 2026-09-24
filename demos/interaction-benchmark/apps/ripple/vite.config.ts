import { execSync } from 'node:child_process';
import { ripple } from '@ripple-ts/vite-plugin';
import { defineConfig, type Plugin } from 'vite';

function benchmarkBuildId(): string {
	if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
	return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
}

function benchmarkBuildMeta(): Plugin {
	const buildId = benchmarkBuildId();
	return {
		name: 'benchmark-build-meta',
		transformIndexHtml: (html) => html.replace('%BENCHMARK_BUILD_ID%', buildId),
	};
}

export default defineConfig({
	appType: 'custom',
	plugins: [ripple(), benchmarkBuildMeta()],
});
