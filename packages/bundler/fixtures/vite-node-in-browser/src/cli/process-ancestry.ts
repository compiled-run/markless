import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

export function parentCommands(): string[] {
	if (platform() === 'win32') return [];
	return execFileSync('ps', ['-o', 'command=', '-p', String(process.ppid)], { encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
}
