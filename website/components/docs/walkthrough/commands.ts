// The shell blocks the Walkthrough shows for each package manager, as the highlighted runs a ```bash fence gets.
import {
	addCommand,
	createCommand,
	DEFAULT_APP,
	MANAGERS,
	type ManagerId,
	scriptCommand,
} from './facts.ts';

/** shiki's github-light and github-dark colours for the four kinds of shell word these commands use; walkthrough.test.ts pins them to the site's fence highlighter. */
export const SHELL_STYLES = {
	command: 'color:#6F42C1;--shiki-dark:#B392F0',
	word: 'color:#032F62;--shiki-dark:#9ECBFF',
	flag: 'color:#005CC5;--shiki-dark:#79B8FF',
	comment: 'color:#6A737D;--shiki-dark:#6A737D',
} as const;

export type ShellRun = { readonly id: string; readonly text: string; readonly style: string };
export type ShellLine = {
	readonly id: string;
	readonly runs: readonly ShellRun[];
};
export type CommandKind = 'create' | 'dev' | 'ship' | 'install' | 'install-editor' | 'start' | 'build';
export type CommandVariant = {
	readonly manager: ManagerId;
	readonly code: string;
	readonly lines: readonly ShellLine[];
};


function rows(kind: CommandKind, manager: ManagerId): [string, string?][] {
	if (kind === 'create') return [[createCommand(manager)]];
	if (kind === 'dev') return [[`cd ${DEFAULT_APP}`], [scriptCommand(manager, 'dev')]];
	if (kind === 'install') return [[addCommand(manager, ['@markless/core', 'vite'])]];
	if (kind === 'install-editor') return [[addCommand(manager, ['@markless/typescript-plugin', 'typescript'], true)]];
	if (kind === 'start') return [[scriptCommand(manager, 'dev')]];
	if (kind === 'build') return [[scriptCommand(manager, 'build')]];
	return [[scriptCommand(manager, 'build')], [scriptCommand(manager, 'preview')]];
}

/** Splits one line into runs the way shiki scopes it: each word keeps the spaces before it. */
export function shellLine(
	command: string,
	comment: string | undefined,
	width: number,
	id: string,
): ShellLine {
	const runs: ShellRun[] = command.split(' ').map((word, index) => ({
		id: `${id}-${index}`,
		text: index === 0 ? word : ' ' + word,
		style:
			index === 0
				? word === 'cd'
					? SHELL_STYLES.flag
					: SHELL_STYLES.command
				: word.startsWith('-')
					? SHELL_STYLES.flag
					: SHELL_STYLES.word,
	}));
	if (comment)
		runs.push({
			id: `${id}-c`,
			text: ' '.repeat(width - command.length + 3) + '# ' + comment,
			style: SHELL_STYLES.comment,
		});
	return { id, runs };
}

export function commandVariants(kind: CommandKind): CommandVariant[] {
	return MANAGERS.map(({ id: manager }) => {
		const written = rows(kind, manager);
		const width = Math.max(...written.map(([command]) => command.length));
		const lines = written.map(([command, comment], index) =>
			shellLine(command, comment, width, `${manager}-${index}`),
		);
		return {
			manager,
			code: lines.map((line) => line.runs.map((run) => run.text).join('')).join('\n'),
			lines,
		};
	});
}
