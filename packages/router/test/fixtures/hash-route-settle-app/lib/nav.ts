export function navClass(current: string, to: string): string {
	return current === to || current.startsWith(`${to}/`) ? 'active' : '';
}
