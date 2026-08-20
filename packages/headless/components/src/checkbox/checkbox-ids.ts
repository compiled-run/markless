// Plain TS, not .tsrx: the counter is module state, not component state. Unused
// until a shared factory can mint an id (see notes/parity-table.md, B1).
let minted = 0;

export function nextCheckboxId(): string {
	minted += 1;
	return `checkbox-${minted}`;
}
