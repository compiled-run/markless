import { Session } from 'node:inspector';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { threadId, isMainThread } from 'node:worker_threads';
import { resolve } from 'node:path';

const directory = process.env.MARKLESS_NAVIGATION_PROFILE_DIR;
if (directory) {
	mkdirSync(directory, { recursive: true });
	const identity = `${process.pid}-${threadId}`;
	const metadata = {
		pid: process.pid,
		threadId,
		isMainThread,
		argv: process.argv,
		execArgv: process.execArgv,
		cwd: process.cwd(),
		timeOrigin: performance.timeOrigin,
		loadedAt: Date.now(),
	};
	writeFileSync(resolve(directory, `${identity}.identity.json`), JSON.stringify(metadata));
	const session = new Session();
	session.connect();
	const post = (method, params = {}) =>
		new Promise((accept, reject) =>
			session.post(method, params, (error, result) =>
				error ? reject(error) : accept(result),
			),
		);
	let active,
		previous,
		busy = false;
	const check = async () => {
		if (busy) return;
		busy = true;
		try {
			const command = JSON.parse(readFileSync(resolve(directory, 'control.json'), 'utf8'));
			if (command.id === previous) return;
			previous = command.id;
			if (command.action === 'start' && !active) {
				await post('Profiler.enable');
				await post('Profiler.setSamplingInterval', { interval: 1000 });
				await post('Profiler.start');
				active = {
					...metadata,
					command,
					startedAt: Date.now(),
					monotonicStart: performance.now(),
					cpuStart: process.cpuUsage(),
				};
				writeFileSync(
					resolve(directory, `${identity}.${command.window}.started.json`),
					JSON.stringify(active),
				);
			} else if (command.action === 'stop' && active) {
				const { profile } = await post('Profiler.stop');
				writeFileSync(
					resolve(directory, `${identity}.${active.command.window}.cpuprofile`),
					JSON.stringify(profile),
				);
				writeFileSync(
					resolve(directory, `${identity}.${active.command.window}.stopped.json`),
					JSON.stringify({
						...active,
						stoppedAt: Date.now(),
						stopCommand: command,
						cpu: process.cpuUsage(active.cpuStart),
					}),
				);
				active = undefined;
			}
		} catch (error) {
			if (error.code !== 'ENOENT')
				writeFileSync(
					resolve(directory, `${identity}.error.json`),
					JSON.stringify({ message: error.message, at: Date.now() }),
				);
		} finally {
			busy = false;
		}
	};
	setInterval(check, 25).unref();
	void check();
}
