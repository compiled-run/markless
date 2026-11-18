// A build keeps Rolldown's native memory until its process exits, so each non-dev box gets a process of its own.
import { execFileSync, spawnSync } from 'node:child_process';

// The pnpm bin shim, not the CLI file: its NODE_PATH lets workspace sources resolve their dependencies.
const cli = 'witness';
const witness = (args: readonly string[]) => spawnSync(cli, args, { stdio: 'inherit' }).status ?? 1;

type Listed = { readonly file: string; readonly modes: readonly string[] };
const { boxes } = JSON.parse(execFileSync(cli, ['list', '--json'], { encoding: 'utf8' })) as {
	readonly boxes: readonly Listed[];
};

const runs = [
	...(boxes.some((box) => box.modes.includes('dev')) ? [['run', '--mode', 'dev']] : []),
	...boxes.filter((box) => !box.modes.includes('dev')).map((box) => ['run', box.file]),
];
let failed = 0;
for (const args of runs) if (witness(args) !== 0) failed += 1;
process.exit(failed === 0 ? 0 : 1);
