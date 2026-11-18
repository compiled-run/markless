export type FileEntry = { id: number; name: string };

let answer: ((files: FileEntry[]) => void) | undefined;

export const getFiles = () => new Promise<FileEntry[]>((resolve) => (answer = resolve));

export function resolveFiles(files: FileEntry[]): boolean {
	if (!answer) return false;
	answer(files);
	answer = undefined;
	return true;
}
