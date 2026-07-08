export function marklessCsrRepeatRows(
	items,
	keyForRow,
	repeatId,
	itemName,
	keyPath,
	renderRow,
	renderEmpty,
) {
	const list = Array.isArray(items) ? items : Array.from(items ?? []);
	marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath);
	if (list.length === 0) return renderEmpty ? renderEmpty() : '';
	return list.map(renderRow).join('');
}
export function marklessSsrRepeatRows(
	hostLocators,
	items,
	keyForRow,
	repeatId,
	itemName,
	keyPath,
	renderRow,
	elementsPerRow,
	renderEmpty,
) {
	const list = Array.isArray(items) ? items : Array.from(items ?? []);
	marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath);
	if (list.length === 0) return renderEmpty ? renderEmpty() : '';
	const html = list.map(renderRow).join('');
	hostLocators.marklessSsrExtraElements =
		(hostLocators.marklessSsrExtraElements ?? 0) + list.length * elementsPerRow;
	return html;
}
// Component-bearing rows: each row awaits child component renders, so the
// per-row element count is only known from the rendered truth — count element
// opens from the joined html (the same census marklessSsrArmizeBoundaries
// uses) instead of trusting a static count.
export async function marklessSsrComponentRepeatRows(
	hostLocators,
	items,
	keyForRow,
	repeatId,
	itemName,
	keyPath,
	renderRow,
	renderEmpty,
) {
	const list = Array.isArray(items) ? items : Array.from(items ?? []);
	marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath);
	if (list.length === 0) return renderEmpty ? renderEmpty() : '';
	const html = (await Promise.all(list.map(renderRow))).join('');
	hostLocators.marklessSsrExtraElements =
		(hostLocators.marklessSsrExtraElements ?? 0) + (html.match(/<[a-zA-Z]/g) ?? []).length;
	return html;
}
export function marklessAssertUniqueRepeatKeys(items, keyForRow, repeatId, itemName, keyPath) {
	const seen = new Set();
	for (const item of items) {
		const key = keyForRow(item);
		if (seen.has(key)) throw marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key);
		seen.add(key);
	}
}
export function marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key) {
	const source = `${itemName}.${keyPath.join('.')}`;
	const keyText = JSON.stringify(key);
	const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Two items produced the same key ${keyText} from ${source}. Rows with the same key cannot be told apart, so one of them would silently replace the other.`;
	const error = new Error(message);
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
