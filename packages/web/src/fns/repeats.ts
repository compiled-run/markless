import type { MarklessSsrHostLocators } from './ssr.ts';

// A @for collection is whatever the authored expression produced.
type MarklessRepeatItems = Iterable<unknown> | null | undefined;
type MarklessRepeatKeyForRow = (item: unknown) => unknown;
type MarklessRepeatRenderRow = (item: unknown, index: number) => string;
type MarklessRepeatKeyPath = ReadonlyArray<string>;

export function marklessCsrRepeatRows(
	items: MarklessRepeatItems,
	keyForRow: MarklessRepeatKeyForRow,
	repeatId: string,
	itemName: string,
	keyPath: MarklessRepeatKeyPath,
	renderRow: MarklessRepeatRenderRow,
	renderEmpty?: () => string,
) {
	const list: ReadonlyArray<unknown> = Array.isArray(items) ? items : Array.from(items ?? []);
	marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath);
	if (list.length === 0) return renderEmpty ? renderEmpty() : '';
	return list.map(renderRow).join('');
}
export function marklessSsrRepeatRows(
	hostLocators: MarklessSsrHostLocators,
	items: MarklessRepeatItems,
	keyForRow: MarklessRepeatKeyForRow,
	repeatId: string,
	itemName: string,
	keyPath: MarklessRepeatKeyPath,
	renderRow: MarklessRepeatRenderRow,
	elementsPerRow: number,
	renderEmpty?: () => string,
) {
	const list: ReadonlyArray<unknown> = Array.isArray(items) ? items : Array.from(items ?? []);
	marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath);
	if (list.length === 0) return renderEmpty ? renderEmpty() : '';
	const html = list.map(renderRow).join('');
	hostLocators.marklessSsrExtraElements =
		(hostLocators.marklessSsrExtraElements ?? 0) + list.length * elementsPerRow;
	return html;
}
export function marklessAssertUniqueRepeatKeys(
	items: Iterable<unknown>,
	keyForRow: MarklessRepeatKeyForRow,
	repeatId: string,
	itemName: string,
	keyPath: MarklessRepeatKeyPath,
) {
	const seen = new Set<unknown>();
	for (const item of items) {
		const key = keyForRow(item);
		if (seen.has(key)) throw marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key);
		seen.add(key);
	}
}
export function marklessRepeatDuplicateKeyError(
	repeatId: string,
	itemName: string,
	keyPath: MarklessRepeatKeyPath,
	key: unknown,
) {
	const source = `${itemName}.${keyPath.join('.')}`;
	const keyText = JSON.stringify(key);
	const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Two items produced the same key ${keyText} from ${source}. Rows with the same key cannot be told apart, so one of them would silently replace the other.`;
	const error = new Error(message) as Error & Record<string, unknown>;
	Object.defineProperty(error, 'message', {
		value: message,
		enumerable: true,
		configurable: true,
	});
	error.name = 'KeyedRepeatRuntimeError';
	error.code = 'MARKLESS_REPEAT_KEY_DUPLICATE';
	error.severity = 'error';
	error.phase = 'runtime';
	error.title = 'Two rows share the same @for key';
	error.why =
		'The key is each row identity across reorder, insert, delete, and resume; duplicate identities make row state and DOM ownership ambiguous.';
	error.repeatId = repeatId;
	error.keyPath = keyPath;
	error.collidingValue = key;
	error.suggestions = [
		{
			message:
				'Key by a field that is unique per item, or make the key compound where the data allows it. If the data has no unique field, key by position with index i; key i.',
		},
	];
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE';
	return error;
}
