import { reportClientBuildProgress } from '../../../src/vite/separate-client-build.ts';

reportClientBuildProgress(20);
if (process.argv[2] === 'busy') {
	const until = performance.now() + 1_000;
	while (performance.now() < until) {
		const slice = performance.now() + 10;
		while (performance.now() < slice);
		await new Promise((resolve) => setImmediate(resolve));
	}
	process.exit(0);
}
// Like a file watcher a plugin left open: it holds the process, and the awaited build never settles.
setInterval(() => {}, 2 ** 30);
await new Promise(() => {});
