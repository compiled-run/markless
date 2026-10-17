export function openPanel(name: string, onClose: (why: string) => void): void {
	if (name === '') onClose('empty');
}
