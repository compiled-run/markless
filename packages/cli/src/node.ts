import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { basename, resolve } from 'pathe';
import { decodePath, parseURL } from 'ufo';
import {
	CreateProgram,
	type ProgramDirectoryEntry,
	type ProgramFileSystem,
	type ProgramRuntime,
} from './index.ts';

export function createNodeRuntime(): ProgramRuntime {
	return {
		cwd: () => process.cwd(),
		env: process.env,
		fs: nodeFileSystem,
		isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
		stdout: process.stdout,
		stderr: process.stderr,
		spawn(command, args, options) {
			return spawnSync(command, [...args], options);
		},
	};
}

export async function runCli(runtime = createNodeRuntime()): Promise<void> {
	const args = process.argv.slice(2);
	const command = basename(process.argv[1] ?? '');
	const createArgs = command === 'arcade' && args[0] === 'create' ? args.slice(1) : args;
	const program = new CreateProgram();

	await program.run(createArgs, runtime);
}

const nodeFileSystem: ProgramFileSystem = {
	async mkdir(path, options) {
		await mkdir(path, options);
	},
	async readDirectory(path) {
		const entries = await readdir(path, { withFileTypes: true });
		return entries.flatMap((entry): ProgramDirectoryEntry[] => {
			if (entry.isDirectory()) return [{ name: entry.name, kind: 'directory' }];
			if (entry.isFile()) return [{ name: entry.name, kind: 'file' }];
			return [];
		});
	},
	readFile(path) {
		return readFile(path, 'utf-8');
	},
	async stat(path) {
		return await stat(path).catch(() => null);
	},
	async writeFile(path, contents) {
		await writeFile(path, contents);
	},
};

function isEntrypoint(scriptPath: string | undefined, moduleUrl: string): boolean {
	return (
		scriptPath !== undefined && resolve(scriptPath) === decodePath(parseURL(moduleUrl).pathname)
	);
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
	await runCli();
}
