import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

function benchmarkBuildId(): string {
	if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID;
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

export default defineConfig({
	plugins: [octane()],
	define: { __BENCHMARK_BUILD_ID__: JSON.stringify(benchmarkBuildId()) },
	build: { target: 'esnext' },
});
