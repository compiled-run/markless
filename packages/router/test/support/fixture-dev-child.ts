import { resolve } from 'pathe';
import { createServer } from 'vite';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { FIXTURE_DEV_READY } from './fixture-dev.ts';

const root = process.argv[2]!;
const port = Number(process.argv[3]);
const server = await createServer({
	root,
	configFile: false,
	logLevel: 'warn',
	plugins: [markless(), router()],
	// The fixture is copied outside the workspace; Nitro's dev entry and the packages stay inside it.
	server: {
		host: '127.0.0.1',
		port,
		strictPort: true,
		watch: null,
		fs: { allow: [root, resolve(import.meta.dirname, '../../../..')] },
	},
});
await server.listen();
process.stdout.write(`${FIXTURE_DEV_READY} http://127.0.0.1:${port}\n`);
const close = () => void server.close().then(() => process.exit(0));
process.once('SIGTERM', close);
process.stdin.once('end', close);
process.stdin.resume();
