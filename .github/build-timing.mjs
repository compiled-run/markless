// Interleaves cold and warm markless.dev builds of every variant, then prints medians.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const variants = readFileSync('.github/build-timing-variants.txt', 'utf8')
	.split('\n')
	.map((line) => line.trim().split(/\s+/))
	.filter(([name]) => name)
	.map(([name, , env]) => ({
		name,
		env: Object.fromEntries(
			(env ?? '')
				.split(',')
				.filter(Boolean)
				.map((kv) => kv.split('=')),
		),
	}));
const rounds = Number(process.env.ROUNDS ?? 3);
const results = [];

function build(variant, mode) {
	const dir = resolve(`../v-${variant.name}`);
	const site = `${dir}/website`;
	if (mode === 'cold') rmSync(`${site}/node_modules/.vite`, { recursive: true, force: true });
	rmSync(`${site}/.vercel`, { recursive: true, force: true });
	rmSync(`${site}/.output`, { recursive: true, force: true });
	return new Promise((done) => {
		const started = Date.now();
		const child = spawn(
			'/usr/bin/time',
			['-f', '%U %S %M', 'node', `${site}/node_modules/vite-plus/bin/vp`, 'build'],
			{
				cwd: site,
				env: {
					...process.env,
					NITRO_PRESET: 'vercel',
					NODE_PATH: `${dir}/node_modules/.pnpm/node_modules`,
					...variant.env,
				},
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);
		let err = '';
		child.stderr.on('data', (d) => (err += d));
		child.on('close', (code) => {
			const wall = (Date.now() - started) / 1000;
			const [user, sys, maxKb] = err.trim().split('\n').at(-1).split(' ').map(Number);
			const row = {
				variant: variant.name,
				mode,
				code,
				wall,
				cpu: user + sys,
				maxRssGb: maxKb / 1e6,
			};
			console.log(JSON.stringify(row));
			if (code !== 0) console.log(err.slice(-3000));
			results.push(row);
			done();
		});
	});
}

for (let round = 1; round <= rounds; round++)
	for (const variant of variants) for (const mode of ['cold', 'warm']) await build(variant, mode);

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
console.log('\nvariant mode n wall(median,min,max) cpu(median) maxRss(median)');
for (const variant of variants)
	for (const mode of ['cold', 'warm']) {
		const rows = results.filter(
			(row) => row.variant === variant.name && row.mode === mode && row.code === 0,
		);
		if (!rows.length) continue;
		const wall = rows.map((row) => row.wall);
		console.log(
			`${variant.name} ${mode} ${rows.length} ${median(wall).toFixed(1)}s (${Math.min(...wall).toFixed(1)}-${Math.max(...wall).toFixed(1)}) cpu ${median(rows.map((row) => row.cpu)).toFixed(1)}s rss ${median(rows.map((row) => row.maxRssGb)).toFixed(2)}GB`,
		);
	}
