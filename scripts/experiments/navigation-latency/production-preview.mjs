import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST } from '../../../packages/router/src/vite/client-assets-manifest.ts';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function filesIn(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await filesIn(path)));
		else if (entry.isFile()) files.push(path);
		else throw Error('Unsupported build entry: ' + path);
	}
	return files.sort();
}
export async function readBuildInventory(directory) {
	const buildDir = resolve(directory),
		entry = resolve(buildDir, 'site/server/index.mjs');
	const publicDir = resolve(buildDir, 'site/public');
	const inventoryPath = resolve(buildDir, 'chunks-client.json');
	const inventoryBody = await readFile(inventoryPath);
	const graph = JSON.parse(inventoryBody);
	if (resolve(graph.directory) !== publicDir)
		throw Error('Build inventory public directory mismatch');
	const manifest = JSON.parse(
		await readFile(resolve(publicDir, MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST)),
	);
	const assets = new Map(),
		digest = createHash('sha256');
	digest.update('chunks-client.json').update(inventoryBody);
	const fileHashes = {};
	for (const path of await filesIn(resolve(buildDir, 'site'))) {
		const body = await readFile(path),
			name = relative(buildDir, path),
			hash = sha256(body);
		fileHashes[name] = hash;
		digest.update(name).update(hash);
		if (path.startsWith(publicDir + '/') && /\.(?:m?js)$/.test(path)) {
			const urlPath = manifest.base + relative(publicDir, path).split('\\').join('/');
			assets.set(urlPath, { path, urlPath, sha256: hash, decodedBytes: body.length });
		}
	}
	if (!fileHashes['site/server/index.mjs']) throw Error('Generated server entry missing');
	for (const chunk of graph.chunks)
		if (!assets.has(manifest.base + chunk.fileName))
			throw Error('Expected application JavaScript missing: ' + chunk.fileName);
	const identityAsset = graph.chunks
		.map((chunk) => assets.get(manifest.base + chunk.fileName))
		.sort((a, b) => b.decodedBytes - a.decodedBytes || a.urlPath.localeCompare(b.urlPath))[0];
	if (!identityAsset) throw Error('No generated application JavaScript inventory');
	return {
		buildDir,
		entry,
		publicDir,
		inventoryPath,
		graph,
		manifest,
		assets,
		identityAsset,
		fileHashes,
		digest: digest.digest('hex'),
	};
}
export async function verifyServedAsset(origin, asset) {
	if (!asset?.sha256 || !asset?.urlPath) throw Error('Missing expected identity asset');
	const response = await fetch(new URL(asset.urlPath, origin), {
		signal: AbortSignal.timeout(1000),
	});
	const body = Buffer.from(await response.arrayBuffer());
	const observed = {
		url: response.url,
		status: response.status,
		expected: asset.sha256,
		actual: sha256(body),
	};
	if (!response.ok || observed.actual !== observed.expected)
		throw Error('Served build identity mismatch: ' + JSON.stringify(observed));
	return observed;
}
export async function assertPortAvailable(port) {
	await new Promise((accept, reject) => {
		const server = net.createServer();
		server.once('error', (error) =>
			reject(Error('Preview port unavailable: ' + error.message)),
		);
		server.listen(Number(port), '127.0.0.1', () => server.close(accept));
	});
}
export function devLaunchArgs(config, port) {
	return [
		'exec',
		'vp',
		'dev',
		'--config',
		config,
		'--host',
		'127.0.0.1',
		'--port',
		String(port),
		'--strictPort',
	];
}
export async function stopOwnedProcess(child) {
	if (!child?.pid) throw Error('Cannot identify owned child');
	if (child.exitCode !== null || child.signalCode !== null) return;
	process.kill(-child.pid, 'SIGTERM');
	const end = Date.now() + 3000;
	while (child.exitCode === null && child.signalCode === null && Date.now() < end)
		await delay(20);
	if (child.exitCode === null && child.signalCode === null) {
		process.kill(-child.pid, 'SIGKILL');
		await new Promise((resolve) => child.once('exit', resolve));
	}
}
export async function waitForBuildReady(origin, asset, child, timeoutMs = 15000) {
	const end = Date.now() + timeoutMs;
	let lastError;
	while (Date.now() < end) {
		if (child.exitCode !== null || child.signalCode !== null)
			throw Error('Generated server exited before readiness');
		try {
			return await verifyServedAsset(origin, asset);
		} catch (error) {
			lastError = error;
			if (String(error).includes('identity mismatch')) throw error;
		}
		await delay(25);
	}
	throw Error('Bounded preview readiness failed: ' + lastError);
}
export async function launchProductionPreview({
	buildDir,
	output,
	port,
	cwd,
	timeoutMs,
	onSpawn,
	reuse = true,
}) {
	if (
		reuse &&
		(resolve(output) === resolve(buildDir) ||
			resolve(output).startsWith(resolve(buildDir) + '/'))
	)
		throw new Error('Reuse output must be outside the read-only build directory');
	const inventory = await readBuildInventory(buildDir);
	await assertPortAvailable(port);
	await mkdir(output, { recursive: true });
	const overrides = { NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) };
	const child = spawn(process.execPath, [inventory.entry], {
		cwd,
		env: { ...process.env, ...overrides },
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	onSpawn?.(child);
	child.stdout.pipe(process.stdout);
	child.stderr.pipe(process.stderr);
	const receipt = {
		buildDir: inventory.buildDir,
		entry: inventory.entry,
		publicDir: inventory.publicDir,
		inventoryPath: inventory.inventoryPath,
		buildDigest: inventory.digest,
		identityAsset: inventory.identityAsset,
		executable: process.execPath,
		args: [inventory.entry],
		cwd,
		environmentOverrides: overrides,
		pid: process.pid,
		childPid: child.pid,
		url: `http://127.0.0.1:${port}`,
		reuse,
	};
	await writeFile(resolve(output, 'server.json'), JSON.stringify(receipt, null, 2));
	const stop = async () => {
		await stopOwnedProcess(child);
		await writeFile(
			resolve(output, 'cleanup.json'),
			JSON.stringify({
				childPid: child.pid,
				exitCode: child.exitCode,
				signalCode: child.signalCode,
			}),
		);
	};
	try {
		receipt.identity = await waitForBuildReady(
			receipt.url,
			inventory.identityAsset,
			child,
			timeoutMs,
		);
		await writeFile(resolve(output, 'server.json'), JSON.stringify(receipt, null, 2));
		return { child, inventory, receipt, stop };
	} catch (error) {
		await stop();
		throw error;
	}
}
export function isApplicationJavaScript(
	url,
	type = '',
	mime = '',
	origin = 'http://127.0.0.1:4496',
) {
	const parsed = new URL(url);
	return (
		parsed.origin === origin &&
		(/\.(?:m?js)$/.test(parsed.pathname) ||
			type.toLowerCase() === 'script' ||
			/javascript|ecmascript/.test(mime))
	);
}
export function validateCapture({
	responses,
	failures = [],
	pending = 0,
	overflow = 0,
	missingResources = [],
}) {
	const issues = [...failures];
	if (pending) issues.push('Unaccounted JavaScript response bodies: ' + pending);
	if (overflow) issues.push('ResourceTiming overflow: ' + overflow);
	for (const response of responses) {
		if (!response.expected) issues.push('Missing build identity: ' + response.url);
		if (!response.sha256) issues.push('Missing response body: ' + response.url);
		if (response.expected && response.sha256 && response.expected !== response.sha256)
			issues.push('Mismatched JavaScript body: ' + response.url);
		if (response.status < 200 || response.status >= 400)
			issues.push('Failed JavaScript response: ' + response.url);
	}
	issues.push(
		...missingResources.map((url) => 'Missing JavaScript ResourceTiming entry: ' + url),
	);
	return { valid: issues.length === 0, issues };
}
export function captureApplicationJavaScript(page, inventory, origin = 'http://127.0.0.1:4496') {
	const responses = [],
		failures = [],
		requests = new Map(),
		jobs = [];
	let pending = 0,
		lastActivity = Date.now();
	const active = new Set();
	const ensure = (request) => {
		let record = requests.get(request);
		if (!record) {
			record = { url: request.url(), requestType: request.resourceType() };
			requests.set(request, record);
			active.add(request);
			lastActivity = Date.now();
		}
		return record;
	};
	page.on('request', (request) => {
		if (isApplicationJavaScript(request.url(), request.resourceType(), '', origin))
			ensure(request);
	});
	page.on('requestfinished', (request) => {
		if (active.delete(request)) lastActivity = Date.now();
	});
	page.on('requestfailed', (request) => {
		if (active.delete(request)) lastActivity = Date.now();
		if (
			requests.has(request) ||
			isApplicationJavaScript(request.url(), request.resourceType(), '', origin)
		)
			failures.push(
				'Failed JavaScript load: ' + request.url() + ' ' + request.failure()?.errorText,
			);
	});
	page.on('response', (response) => {
		const request = response.request();
		if (
			!isApplicationJavaScript(
				response.url(),
				request.resourceType(),
				response.headers()['content-type'] ?? '',
				origin,
			)
		)
			return;
		const record = ensure(request);
		Object.assign(record, {
			status: response.status(),
			expected: inventory.assets.get(new URL(response.url()).pathname)?.sha256,
		});
		responses.push(record);
		pending++;
		jobs.push(
			(async () => {
				try {
					const body = await response.body();
					Object.assign(record, {
						sha256: sha256(body),
						decodedBodyBytes: body.length,
						sizes: await request.sizes(),
					});
				} catch (error) {
					failures.push(
						'JavaScript body unavailable: ' + response.url() + ' ' + error.message,
					);
				} finally {
					pending--;
				}
			})(),
		);
	});
	return {
		responses,
		async finish(snapshot) {
			const deadline = Date.now() + 30000;
			while ((active.size || Date.now() - lastActivity < 500) && Date.now() < deadline)
				await delay(25);
			if (active.size) failures.push('JavaScript evidence drain timed out');
			let count;
			do {
				count = jobs.length;
				await Promise.all(jobs);
			} while (jobs.length !== count);
			const { resources, overflow } = await snapshot();
			const available = new Map();
			for (const resource of resources)
				available.set(resource.name, (available.get(resource.name) ?? 0) + 1);
			const missingResources = [];
			for (const response of responses) {
				const count = available.get(response.url) ?? 0;
				if (!count) missingResources.push(response.url);
				else available.set(response.url, count - 1);
			}
			for (const record of requests.values())
				if (!responses.includes(record))
					failures.push('Missing JavaScript response: ' + record.url);
			return {
				...validateCapture({ responses, failures, pending, overflow, missingResources }),
				responses: responses.map((response) => ({ ...response })),
				overflow,
			};
		},
	};
}
