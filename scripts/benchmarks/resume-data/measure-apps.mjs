// Builds each app in the consumer posture, serves it and weighs its pages with measure-page.mjs.
// usage: node scripts/benchmarks/resume-data/measure-apps.mjs [--no-build] [--only id,id] [--out file.json]
//   MARKLESS_SHADCN_ADMIN_DIR=<dir> adds the shadcn-admin port (a copy linked to this tree's packages).

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measurePage } from './measure-page.mjs';
import { scriptFamilies } from './script-families.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (name) => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};
const only = flag('--only')?.split(',');

const APPS = [
	{ id: 'static-router', dir: 'demos/static-router', serve: 'server', routes: ['/', '/counter'] },
	{ id: 'music-player-ssr', dir: 'demos/music-player-ssr', serve: 'server', routes: ['/'] },
	{ id: 'live-feed-ssr', dir: 'demos/live-feed-ssr', serve: 'server', routes: ['/?latency=0'] },
	{ id: 'music-player', dir: 'demos/music-player', serve: 'preview', routes: ['/'] },
	{ id: 'live-feed', dir: 'demos/live-feed', serve: 'preview', routes: ['/?latency=0'] },
	{
		id: 'markless.dev',
		dir: 'website',
		serve: 'server',
		routes: ['/', '/start/new-app', '/reference', '/ui/accordion', '/ui/combobox'],
	},
	...(process.env.MARKLESS_SHADCN_ADMIN_DIR
		? [
				{
					id: 'shadcn-admin',
					dir: process.env.MARKLESS_SHADCN_ADMIN_DIR,
					external: true,
					serve: 'server',
					routes: ['/users', '/', '/sign-in'],
				},
			]
		: []),
].filter((app) => !only || only.includes(app.id));

const results = {};
for (const app of APPS) {
	const cwd = resolve(ROOT, app.dir);
	// An app outside the workspace builds with its own vp: pnpm there would re-install through the links.
	const vp = app.external ? [resolve(cwd, 'node_modules/.bin/vp')] : ['pnpm', 'exec', 'vp'];
	if (!args.includes('--no-build')) await run(vp[0], [...vp.slice(1), 'build'], cwd);
	const port = await freePort();
	const server =
		app.serve === 'server'
			? spawn('node', ['.output/server/index.mjs'], {
					cwd,
					env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
					stdio: 'ignore',
					detached: true,
				})
			: spawn(
					vp[0],
					[
						...vp.slice(1),
						'preview',
						'--host',
						'127.0.0.1',
						'--port',
						String(port),
						'--strictPort',
					],
					{
						cwd,
						env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
						stdio: 'ignore',
						detached: true,
					},
				);
	try {
		await waitForPort(port);
		results[app.id] = {};
		for (const route of app.routes) {
			const measured = await measurePage(`http://127.0.0.1:${port}${route}`);
			measured.jsDownloadedAtLoad.families = scriptFamilies(
				cwd,
				measured.jsDownloadedAtLoad.perFile,
			);
			results[app.id][route] = measured;
			console.log(
				`${app.id} ${route}: html ${measured.html.raw}/${measured.html.gzip}, resume data ${measured.resumeData.total.raw}/${measured.resumeData.total.gzip}, js@load ${measured.jsDownloadedAtLoad.raw}/${measured.jsDownloadedAtLoad.gzip}, executed@load ${measured.jsExecutedAtLoad.bytes}`,
			);
		}
	} finally {
		process.kill(-server.pid, 'SIGTERM');
	}
}
const out = flag('--out');
if (out) writeFileSync(out, JSON.stringify(results, null, '\t') + '\n');

function run(command, commandArgs, cwd) {
	return new Promise((done, fail) => {
		const child = spawn(command, commandArgs, {
			cwd,
			env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1', NODE_ENV: 'production' },
			stdio: ['ignore', 'ignore', 'inherit'],
		});
		child.on('exit', (code) =>
			code === 0
				? done()
				: fail(new Error(`${command} ${commandArgs.join(' ')} in ${cwd} exited ${code}`)),
		);
	});
}

function freePort() {
	return new Promise((done) => {
		const server = createServer();
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => done(port));
		});
	});
}

async function waitForPort(port) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const ok = await fetch(`http://127.0.0.1:${port}/`).then(
			() => true,
			() => false,
		);
		if (ok) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`nothing answered on port ${port}`);
}
