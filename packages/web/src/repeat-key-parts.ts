import type { ProtocolRepeatKeyParts } from '@markless/serializer/protocol';

// A key joined from a row's fields: its text pieces, and each path's value as a template literal writes it.
export function joinRepeatKeyParts(
	item: unknown,
	keyParts: ProtocolRepeatKeyParts,
	read: (item: unknown, path: ReadonlyArray<string>) => unknown,
): string {
	let key = '';
	for (const part of keyParts) key += typeof part === 'string' ? part : `${read(item, part)}`;
	return key;
}
