export const TABS = [{ id: 'first' }, { id: 'second' }] as const;

export const EMPTY = '';

export function shout(value: string): string {
	return value.toUpperCase();
}
