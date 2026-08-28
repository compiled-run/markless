// Chunk-by-chunk diff of two demo builds. Chunk file names are content-hashed,
// so two builds are matched by NORMALIZED content (every chunk-<hash>.js
// reference rewritten to a placeholder) rather than by name.
//
//   node chunk-diff.mjs snapshot <demo-dir> <snapshot-dir>
//   node chunk-diff.mjs diff <before-dir> <after-dir>
//
// A snapshot keeps the served page's HTML too, so the eager fetch set (the
// `page-load download` stage) can be attributed per chunk.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const MODULEPRELOAD_LINK =
	/<link\b[^>]*\brel=(?:"modulepreload"|'modulepreload'|modulepreload(?=[\s/>]))[^>]*\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const SCRIPT_SRC = /\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/;

const [, , command, ...args] = process.argv;
if (command === 'snapshot') await snapshot(args[0], args[1]);
else if (command === 'diff') diff(args[0], args[1]);
else throw new Error(`unknown command ${command}`);

async function snapshot(demo, out) {
	const build = resolve(demo, '.output/public/build');
	const html = await servedPage(demo);
	const chunks = {};
	for (const file of readdirSync(build).filter((name) => name.endsWith('.js'))) {
		const source = readFileSync(resolve(build, file), 'utf8');
		const normal = source.replace(/chunk-[A-Za-z0-9_$-]+\.js/g, 'CHUNK');
		chunks[file] = {
			raw: Buffer.byteLength(source),
			gzip: gzipSync(Buffer.from(source), { level: 9 }).length,
			id: createHash('sha256').update(normal).digest('hex').slice(0, 16),
			normal,
		};
	}
	mkdirSync(out, { recursive: true });
	writeFileSync(resolve(out, 'page.html'), html);
	writeFileSync(resolve(out, 'chunks.json'), JSON.stringify({ chunks, eager: eagerChunkNames(html) }));
	console.log(`snapshot ${out}: ${Object.keys(chunks).length} chunks, ${eagerChunkNames(html).length} eager`);
}

function diff(beforeDir, afterDir) {
	const before = load(beforeDir);
	const after = load(afterDir);
	const byId = (side) => {
		const map = new Map();
		for (const [name, chunk] of Object.entries(side.chunks))
			map.set(chunk.id, { name, ...chunk, eager: side.eager.includes(name) });
		return map;
	};
	const left = byId(before);
	const right = byId(after);

	const report = (title, ids, source) => {
		const rows = [...ids].map((id) => source.get(id));
		rows.sort((a, b) => b.gzip - a.gzip);
		const gzip = rows.reduce((total, row) => total + row.gzip, 0);
		const eagerGzip = rows.filter((row) => row.eager).reduce((total, row) => total + row.gzip, 0);
		console.log(`\n## ${title}: ${rows.length} chunks, ${gzip} gzip (${eagerGzip} of it eager)`);
		for (const row of rows)
			console.log(`  ${row.eager ? 'EAGER' : '     '} ${row.gzip.toString().padStart(6)} gzip  ${row.name}  ${headline(row.normal)}`);
	};

	const onlyBefore = [...left.keys()].filter((id) => !right.has(id));
	const onlyAfter = [...right.keys()].filter((id) => !left.has(id));
	console.log(
		`before: ${left.size} chunks / ${before.eager.length} eager / ${sumEager(left)} eager gzip`,
	);
	console.log(
		`after:  ${right.size} chunks / ${after.eager.length} eager / ${sumEager(right)} eager gzip`,
	);
	report('only in BEFORE', onlyBefore, left);
	report('only in AFTER', onlyAfter, right);

	console.log('\n## eager-membership flips (chunk identical, fetch posture changed)');
	for (const [id, row] of right)
		if (left.has(id) && left.get(id).eager !== row.eager)
			console.log(`  ${left.get(id).eager ? 'eager -> lazy' : 'lazy -> EAGER'}  ${row.gzip} gzip  ${row.name}  ${headline(row.normal)}`);
}

function sumEager(side) {
	let total = 0;
	for (const row of side.values()) if (row.eager) total += row.gzip;
	return total;
}

function load(dir) {
	return JSON.parse(readFileSync(resolve(dir, 'chunks.json'), 'utf8'));
}

// A minified chunk's identity is easiest to read off its exported names plus a
// slice of its body; both survive the rename minification does to locals.
function headline(source) {
	const exports = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
		.flatMap((match) => match[1].split(','))
		.map((entry) => entry.trim().split(/\s+as\s+/).pop())
		.filter(Boolean);
	return `exports[${exports.join(' ')}]`;
}

function eagerChunkNames(html) {
	const eager = new Set();
	for (const match of html.matchAll(MODULEPRELOAD_LINK)) eager.add(chunkName(attributeValue(match)));
	for (const match of html.matchAll(SCRIPT_TAG)) {
		const src = SCRIPT_SRC.exec(match[1] ?? '');
		if (src) eager.add(chunkName(attributeValue(src)));
	}
	return [...eager];
}

function attributeValue(match) {
	const value = match[1] ?? match[2] ?? match[3];
	return match[1] === undefined && match[2] === undefined ? value.replace(/\/$/, '') : value;
}

function chunkName(href) {
	return href.slice(href.lastIndexOf('/') + 1);
}

async function servedPage(demo) {
	const port = await freePort();
	const server = spawn(process.execPath, [resolve(demo, '.output/server/index.mjs')], {
		cwd: demo,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	try {
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/`);
				if (response.ok) return await response.text();
			} catch {}
			await new Promise((settle) => setTimeout(settle, 250));
		}
		throw new Error('built server never answered /');
	} finally {
		server.kill('SIGKILL');
	}
}

function freePort() {
	return new Promise((settle, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => settle(port));
		});
	});
}
