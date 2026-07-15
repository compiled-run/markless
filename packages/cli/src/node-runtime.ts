import {
	cancel,
	intro,
	isCancel,
	multiselect as clackMultiselect,
	note,
	outro,
	select as clackSelect,
	text as clackText,
} from '@clack/prompts';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
	link,
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import type { ProgramPrompts, ProgramRuntime, ProgramWritable } from './index.ts';

export interface NodeRuntimeOptions {
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly homeDir?: string;
	readonly isTTY?: boolean;
	readonly prompts?: ProgramPrompts;
	readonly stdout?: ProgramWritable;
	readonly stderr?: ProgramWritable;
}

export function createNodeRuntime(options: NodeRuntimeOptions = {}): ProgramRuntime {
	const isInteractive =
		options.isTTY ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
	return {
		cwd: () => options.cwd ?? process.cwd(),
		env: options.env ?? process.env,
		fs: {
			async atomicCreateFile(path, contents) {
				const temporaryPath = `${String(path)}.${randomUUID()}.tmp`;
				let handle: Awaited<ReturnType<typeof open>> | undefined;
				try {
					handle = await open(temporaryPath, 'wx');
					await handle.writeFile(contents);
					await handle.close();
					handle = undefined;
					try {
						await link(temporaryPath, path);
						return true;
					} catch (error) {
						if (errorCode(error) === 'EEXIST') return false;
						throw error;
					}
				} finally {
					await handle?.close().catch(() => undefined);
					await rm(temporaryPath, { force: true }).catch(() => undefined);
				}
			},
			async atomicWriteFile(path, contents) {
				const temporaryPath = `${String(path)}.${randomUUID()}.tmp`;
				let handle: Awaited<ReturnType<typeof open>> | undefined;
				try {
					handle = await open(temporaryPath, 'wx');
					await handle.writeFile(contents);
					await handle.close();
					handle = undefined;
					await rename(temporaryPath, path);
				} catch (error) {
					await handle?.close().catch(() => undefined);
					await rm(temporaryPath, { force: true }).catch(() => undefined);
					throw error;
				}
			},
			async lstat(path) {
				try {
					return await lstat(path);
				} catch (error) {
					if (errorCode(error) === 'ENOENT') return null;
					throw error;
				}
			},
			mkdir,
			async readDirectory(path) {
				const entries = await readdir(path, { withFileTypes: true });
				return entries.map((entry) => ({
					name: entry.name,
					kind: entry.isDirectory()
						? ('directory' as const)
						: entry.isFile()
							? ('file' as const)
							: entry.isSymbolicLink()
								? ('symlink' as const)
								: ('other' as const),
				}));
			},
			readFile(path) {
				return readFile(path, 'utf-8');
			},
			async stat(path) {
				return await stat(path).catch(() => null);
			},
			remove(path, removeOptions) {
				return rm(path, removeOptions);
			},
			async rmdir(path) {
				try {
					await rmdir(path);
				} catch (error) {
					if (errorCode(error) !== 'ENOTEMPTY' && errorCode(error) !== 'EEXIST') throw error;
				}
			},
			writeFile,
		},
		homeDir: options.homeDir ?? homedir(),
		isTTY: isInteractive,
		prompts: options.prompts ?? (isInteractive ? createClackPrompts() : undefined),
		stdout: options.stdout ?? process.stdout,
		stderr: options.stderr ?? process.stderr,
		spawn(command, args, spawnOptions) {
			return spawnSync(command, [...args], spawnOptions);
		},
		async sha256(contents) {
			return createHash('sha256').update(contents).digest('hex');
		},
	};
}

function createClackPrompts(): ProgramPrompts {
	return {
		intro,
		note,
		async select(options) {
			const value = await clackSelect({
				message: options.message,
				options: options.options.map((option) => ({
					value: option.value,
					label: option.label,
					hint: option.hint || undefined,
				})),
				initialValue: options.initialValue,
			});
			if (isCancel(value)) exitCancelled();
			return value;
		},
		async multiselect(options) {
			const value = await clackMultiselect({
				message: options.message,
				options: options.options.map((option) => ({
					value: option.value,
					label: option.label,
					hint: option.hint || undefined,
					disabled: option.disabled,
				})),
				initialValues: [...options.initialValues],
				required: options.required,
			});
			if (isCancel(value)) exitCancelled();
			return value;
		},
		async text(options) {
			const value = await clackText({
				message: options.message,
				placeholder: options.placeholder,
				defaultValue: options.defaultValue,
				initialValue: options.initialValue,
				validate: options.validate,
			});
			if (isCancel(value)) exitCancelled();
			return value;
		},
		outro,
		cancel,
	};
}

function exitCancelled(): never {
	cancel('Create cancelled.');
	process.exit(0);
}

function errorCode(error: unknown): string | undefined {
	return typeof error === 'object' && error !== null && 'code' in error
		? String(error.code)
		: undefined;
}
