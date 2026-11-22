import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildFixture } from '../../../router/test/support/fixture-build.ts';

const packagesRoot = join(import.meta.dirname, '..', '..', '..');

/**
 * An app's web build as the router builds it, written to `out` (its `server/index.mjs` is the production server, whose
 * `api/` routes answer as they do on the web). The app is built in a scratch folder beside the workspace's packages.
 */
export async function buildAppServer(appDir: string, out: string): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), `markless-app-${basename(appDir)}-`));
	try {
		await cp(appDir, root, { recursive: true });
		await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
		for (const pkg of ['core', 'router', 'device'])
			await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
		await symlink(join(packagesRoot, 'headless/components'), join(root, 'node_modules/@markless/ui'), 'dir');
		// API routes import the server runtime the router builds on.
		await symlink(join(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
		const nodeEnv = process.env.NODE_ENV;
		// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
		process.env.NODE_ENV = 'production';
		try {
			await buildFixture({ root, configFile: join(root, 'vite.config.ts') });
		} finally {
			if (nodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = nodeEnv;
		}
		await rm(out, { recursive: true, force: true });
		await cp(join(root, '.output'), out, { recursive: true });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
