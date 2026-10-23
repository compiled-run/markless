// Preload: CPU-profiles the main thread only (workers untouched) and writes the profile at exit.
import { isMainThread } from 'node:worker_threads';
import { Session } from 'node:inspector';
import { writeFileSync, mkdirSync } from 'node:fs';
if (isMainThread && process.env.MAIN_PROF_DIR) {
	const session = new Session();
	session.connect();
	session.post('Profiler.enable');
	session.post('Profiler.setSamplingInterval', { interval: 1000 });
	session.post('Profiler.start');
	let written = false;
	const write = () => {
		if (written) return;
		written = true;
		session.post('Profiler.stop', (error, result) => {
			if (error) return;
			mkdirSync(process.env.MAIN_PROF_DIR, { recursive: true });
			writeFileSync(
				`${process.env.MAIN_PROF_DIR}/main-${process.pid}.cpuprofile`,
				JSON.stringify(result.profile),
			);
		});
	};
	process.on('beforeExit', write);
	process.on('exit', write);
}
