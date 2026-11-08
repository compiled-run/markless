// G17: the Cloudflare Worker of the inline-CSS fixture, built with its prerendered page's stylesheet small and large.
import { execFile } from 'node:child_process';
import {
	appendFile,
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ROOT_DIR } from './config.mjs';

const exec = promisify(execFile);
const FIXTURE = join(ROOT_DIR, 'packages/router/test/fixtures/inline-css-app');
// `/` is prerendered and imports styles/home.css; `/other` renders in the Worker and imports styles/other.css.
export const SERVER_STYLESHEET_MARKS = {
	prerendered: '--home-mark:home',
	runtime: '--other-mark:other',
	document: '--site-mark:site',
};
const LARGE_RULES = 4000;

const VITE_CONFIG = `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { FRAGMENT_PATH_PREFIX } from ${JSON.stringify(join(ROOT_DIR, 'packages/router/src/vite/fragment-navigation.ts'))};

export default {
	nitro: {
		preset: 'cloudflare-module',
		compatibilityDate: '2026-10-01',
		routeRules: { '/': { prerender: true }, [\`\${FRAGMENT_PATH_PREFIX}/\`]: { prerender: true } },
	},
	plugins: [markless(), router()],
};
`;

async function filesUnder(dir, extension) {
	return (await readdir(dir, { recursive: true }))
		.filter((file) => file.endsWith(extension))
		.map((file) => join(dir, file));
}

async function measureVariant(large, log) {
	const root = await mkdtemp(
		join(tmpdir(), `markless-server-stylesheets-${large ? 'large' : 'small'}-`),
	);
	try {
		await cp(FIXTURE, root, { recursive: true });
		if (large)
			await appendFile(
				join(root, 'styles/home.css'),
				Array.from(
					{ length: LARGE_RULES },
					(_, i) => `.home-rule-${i} { --home-rule: ${i}; padding: ${i % 17}px; }\n`,
				).join(''),
			);
		await writeFile(join(root, 'vite.config.ts'), VITE_CONFIG);
		await writeFile(join(root, 'package.json'), '{ "private": true, "type": "module" }\n');
		await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
		for (const pkg of ['core', 'router'])
			await symlink(
				join(ROOT_DIR, 'packages', pkg),
				join(root, 'node_modules/@markless', pkg),
				'dir',
			);
		await symlink(
			join(ROOT_DIR, 'packages/router/node_modules/nitro'),
			join(root, 'node_modules/nitro'),
			'dir',
		);
		log(
			`server stylesheets: building the inline-CSS fixture for Cloudflare, ${large ? 'large' : 'small'} prerendered stylesheet`,
		);
		await exec(join(ROOT_DIR, 'node_modules/.bin/vp'), ['build'], {
			cwd: root,
			env: { ...process.env, NODE_ENV: 'production' },
			maxBuffer: 64 * 1024 * 1024,
		});
		const worker = await Promise.all(
			(await filesUnder(join(root, '.output/server'), '.mjs')).map((file) =>
				readFile(file, 'utf8'),
			),
		);
		const css = await Promise.all(
			(await filesUnder(join(root, '.output/public'), '.css')).map((file) =>
				readFile(file, 'utf8'),
			),
		);
		const code = worker.join('\n');
		return {
			workerBytes: worker.reduce((total, source) => total + Buffer.byteLength(source), 0),
			clientCssBytes: css.reduce((total, source) => total + Buffer.byteLength(source), 0),
			copies: Object.fromEntries(
				Object.entries(SERVER_STYLESHEET_MARKS).map(([name, mark]) => [
					name,
					code.split(mark).length - 1,
				]),
			),
		};
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

export async function measureServerStylesheets(log = () => {}) {
	return { small: await measureVariant(false, log), large: await measureVariant(true, log) };
}
