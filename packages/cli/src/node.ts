#!/usr/bin/env node
import {
	cancel,
	intro,
	isCancel,
	note,
	outro,
	select as clackSelect,
	text as clackText,
} from '@clack/prompts';
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { CreateProgram, type ProgramPrompts, type ProgramRuntime } from './index.ts';

const isInteractive = process.stdin.isTTY === true && process.stdout.isTTY === true;

const runtime: ProgramRuntime = {
	cwd: () => process.cwd(),
	env: process.env,
	fs: {
		mkdir,
		async readDirectory(path) {
			const entries = await readdir(path, { withFileTypes: true });
			return entries.flatMap((entry) => {
				if (entry.isDirectory()) return [{ name: entry.name, kind: 'directory' as const }];
				if (entry.isFile()) return [{ name: entry.name, kind: 'file' as const }];
				return [];
			});
		},
		readFile(path) {
			return readFile(path, 'utf-8');
		},
		async stat(path) {
			return await stat(path).catch(() => null);
		},
		writeFile,
	},
	isTTY: isInteractive,
	prompts: isInteractive ? createClackPrompts() : undefined,
	stdout: process.stdout,
	stderr: process.stderr,
	spawn(command, args, options) {
		return spawnSync(command, [...args], options);
	},
};

try {
	await new CreateProgram().run(process.argv.slice(2), runtime);
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

function createClackPrompts(): ProgramPrompts {
	return {
		intro(message) {
			intro(message);
		},
		note(message, title) {
			note(message, title);
		},
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
		outro(message) {
			outro(message);
		},
		cancel(message) {
			cancel(message);
		},
	};
}

function exitCancelled(): never {
	cancel('Create cancelled.');
	process.exit(0);
}
