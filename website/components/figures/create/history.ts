// Shell history for the drawn terminals: ArrowUp recalls the commands run at the `$` prompt, newest first, as bash and zsh do.

/** The commands run so far, oldest first, with the one just run added. */
export const remember = (ran: readonly string[], line: string): string[] => [...ran, line];

/** One arrow press: `back` counts commands up from the fresh line (0), ArrowUp is +1 and ArrowDown -1; null when the key goes nowhere, so the typed line stays. */
export function recall(ran: readonly string[], back: number, by: 1 | -1): { back: number; line: string } | null {
	const next = back + by;
	if (next < 0 || next > ran.length) return null;
	return { back: next, line: next === 0 ? '' : ran[ran.length - next]! };
}
