// Which package manager a line typed at a drawn terminal runs with, and what to suggest while it is typed.
import { MANAGERS, type ManagerId } from '../../docs/walkthrough/facts.ts';

export type CommandsOf = (manager: ManagerId) => readonly string[];

export const tidy = (typed: string) => typed.trim().replace(/\s+/g, ' ');

/** The manager saved on the page right now: each terminal keeps its own storage cell, so a handler reads the latest write from the <html> attribute every cell writes. */
export const savedOnPage = (fallback: string) => globalThis.document?.documentElement.getAttribute('data-package-manager') ?? fallback;

/** A saved value as a manager; anything unknown reads as npm. */
export const managerOf = (value: string): ManagerId => MANAGERS.find((m) => m.id === value)?.id ?? 'npm';

/** The managers, the saved one first. */
const byPreference = (saved: ManagerId): ManagerId[] => [saved, ...MANAGERS.map((m) => m.id).filter((id) => id !== saved)];

/** The manager whose command the line is, or null. */
export const ranWith = (line: string, commandsOf: CommandsOf): ManagerId | null => MANAGERS.find((m) => commandsOf(m.id).includes(tidy(line)))?.id ?? null;

/** The faint rest of the first command the typed text starts, trying the saved manager first. */
export function completion(typed: string, saved: ManagerId, commandsOf: CommandsOf): string {
	for (const manager of byPreference(saved)) for (const command of commandsOf(manager)) if (command.startsWith(typed)) return command.slice(typed.length);
	return '';
}

/** Typed text that no accepted command starts with. */
export const isInvalid = (typed: string, commandsOf: CommandsOf) => typed !== '' && !MANAGERS.some((m) => commandsOf(m.id).some((command) => command.startsWith(typed)));

/** For each saved manager, the others the footer names; the saved one is left out since its command is already the ghost. */
export const FOOTERS = MANAGERS.map((saved) => ({
	saved: saved.id,
	others: MANAGERS.filter((m) => m.id !== saved.id).map((m, k) => ({ id: m.id, gap: k === 0 ? '' : ' · ' })),
}));

/** The wait fields of every row but an empty prompt's. */
export const NO_WAIT = { wait0: '', wait1: '', wait2: '', wait3: '', wait4: '' };

/** An empty prompt's wait fields: each manager's main command in MANAGERS order, flat since the drawn rows read them inside a keyed loop. */
export function waitsOf(commandsOf: CommandsOf) {
	const [wait0, wait1, wait2, wait3, wait4] = MANAGERS.map((m) => commandsOf(m.id)[0]!);
	return { wait0: wait0!, wait1: wait1!, wait2: wait2!, wait3: wait3!, wait4: wait4! };
}
