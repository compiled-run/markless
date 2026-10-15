// The shell blocks the Walkthrough shows for each package manager, as the highlighted runs a ```bash fence gets.
import {
	createCommand,
	DEFAULT_APP,
	MANAGERS,
	type ManagerId,
	scriptCommand,
	scriptsFor,
	STARTERS,
	commandFor,
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
export type CommandKind = 'create' | 'dev' | 'scripts' | 'starters';
export type CommandVariant = {
	readonly manager: ManagerId;
	readonly code: string;
	readonly lines: readonly ShellLine[];
};

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, '');

function rows(kind: CommandKind, manager: ManagerId): [string, string?][] {
	if (kind === 'create') return [[createCommand(manager)]];
	if (kind === 'dev') return [[`cd ${DEFAULT_APP}`], [scriptCommand(manager, 'dev')]];
	if (kind === 'scripts')
		return scriptsFor(manager).map((script) => [
			scriptCommand(manager, script.name),
			lower(script.does),
		]);
	return STARTERS.map((starter) => [
		commandFor(starter.id, manager),
		`${starter.label}: ${starter.blurb}`,
	]);
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
