import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import {
	launchProductionPreview,
	devLaunchArgs,
	assertPortAvailable,
	stopOwnedProcess,
} from './production-preview.mjs';
const [output, port = '4496', mode = 'timing', profileFlag] = process.argv.slice(2);
if (!output) throw new Error('Output directory required');
const buildIndex = process.argv.indexOf('--build-dir');
const reuseBuild = buildIndex < 0 ? undefined : resolve(process.argv[buildIndex + 1]);
if (reuseBuild && (resolve(output) === reuseBuild || resolve(output).startsWith(reuseBuild + '/')))
	throw new Error('Reuse output must be outside the read-only build directory');
await mkdir(output, { recursive: true });
const observer =
	mode === 'diagnostic'
		? `const events = []; const observer = {name:'navigation-diagnostic-transform-observer', configResolved(config) { for (const plugin of config.plugins) { const hook = plugin.transform, handler = typeof hook === 'function' ? hook : hook?.handler; if (!handler) continue; const wrapped = async function(code,id,...rest) { const start=performance.now(); try { return await handler.call(this,code,id,...rest); } finally { events.push({plugin:plugin.name,id,environment:this.environment?.name,start,timeOrigin:performance.timeOrigin,pid:process.pid,duration:performance.now()-start}); } }; plugin.transform = typeof hook === 'function' ? wrapped : {...hook,handler:wrapped}; } }, configureServer(server) {server.middlewares.use('/__cold_transforms',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(events));});} };`
		: 'const observer = undefined;';
const production = mode === 'production' || mode === 'production-constrained';
if (reuseBuild && !production) throw new Error('--build-dir requires production mode');
const buildObserver = production
	? `const artifactObserver = { name: 'navigation-build-inventory', apply: 'build', generateBundle(options, bundle) { writeFileSync(${JSON.stringify(resolve(output, 'chunks-'))} + (this.environment?.name ?? 'unknown') + '.json', JSON.stringify({directory: options.dir, chunks: Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({fileName: item.fileName, imports: item.imports, dynamicImports: item.dynamicImports, modules: Object.keys(item.modules)}))}, null, 2)); } };`
	: 'const artifactObserver = undefined;';
const productionOptions = production
	? {
			build: { outDir: resolve(output, 'client') },
			nitro: {
				buildDir: resolve(output, 'nitro-build'),
				output: {
					dir: resolve(output, 'site'),
					publicDir: resolve(output, 'site/public'),
					serverDir: resolve(output, 'site/server'),
				},
			},
		}
	: {};
const config = resolve(output, 'canonical.config.ts');
if (!reuseBuild)
	writeFileSync(
		config,
		`import { writeFileSync } from 'node:fs';\nimport config from ${JSON.stringify(pathToFileURL(resolve('vite.config.ts')).href)};\n${observer}\n${buildObserver}\nconst overrides = ${JSON.stringify(productionOptions)};\nexport default { ...config, ...overrides, ...(overrides.nitro ? {nitro: {...config.nitro, ...overrides.nitro}} : {}), plugins: [...config.plugins, ...(observer ? [observer] : []), ...(artifactObserver ? [artifactObserver] : [])], cacheDir: ${JSON.stringify(resolve(output, 'vite-cache'))} };\n`,
	);
if (production && !reuseBuild && !existsSync(resolve(output, 'build-complete.json'))) {
	const exit = await new Promise((resolve) => {
		const build = spawn('pnpm', ['exec', 'vp', 'build', '--config', config], {
			cwd: process.cwd(),
			stdio: 'inherit',
		});
		build.on('exit', resolve);
	});
	if (exit !== 0) {
		console.error('PRODUCTION_BUILD_FAILED');
		process.exit(exit ?? 1);
	}
	writeFileSync(
		resolve(output, 'build-complete.json'),
		JSON.stringify({ builtAt: new Date().toISOString() }),
	);
}
if (production) {
	let launched, ownedChild;
	let stopping = false;
	const stop = async () => {
		if (stopping) return;
		stopping = true;
		if (launched) await launched.stop();
		else if (ownedChild) await stopOwnedProcess(ownedChild);
		process.exit(0);
	};
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
	try {
		launched = await launchProductionPreview({
			buildDir: reuseBuild ?? output,
			output,
			port,
			cwd: process.cwd(),
			reuse: !!reuseBuild,
			onSpawn: (child) => {
				ownedChild = child;
			},
		});
		console.log('NAVIGATION_SERVER_READY');
		launched.child.on('exit', (code) => {
			if (!stopping) process.exit(code ?? 1);
		});
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
} else {
	const profileModule = new URL('./server-profile.mjs', import.meta.url).href;
	const env =
		profileFlag === '--server-profile'
			? {
					...process.env,
					MARKLESS_NAVIGATION_PROFILE_DIR: resolve(output, 'server-cpu'),
					NODE_OPTIONS: [process.env.NODE_OPTIONS, '--import=' + profileModule]
						.filter(Boolean)
						.join(' '),
				}
			: process.env;
	const args = devLaunchArgs(config, port);
	await assertPortAvailable(port);
	const child = spawn('pnpm', args, {
		cwd: process.cwd(),
		detached: true,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let ready = false;
	child.stdout.on('data', (chunk) => {
		process.stdout.write(chunk);
		if (!ready && String(chunk).includes(`:${port}`)) {
			ready = true;
			writeFileSync(
				resolve(output, 'server.json'),
				JSON.stringify(
					{
						pid: process.pid,
						childPid: child.pid,
						cwd: process.cwd(),
						args,
						url: `http://127.0.0.1:${port}/markless/`,
						environmentObservation:
							'Unmeasured in canonical CLI; prior custom-launch observations do not establish canonical capability',
					},
					null,
					2,
				),
			);
			console.log('NAVIGATION_SERVER_READY');
		}
	});
	child.stderr.on('data', (chunk) => process.stderr.write(chunk));
	child.on('exit', (code) => process.exit(code ?? 0));
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.on(signal, () => {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {}
		});
}
