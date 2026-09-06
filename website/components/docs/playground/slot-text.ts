// What the code panel prints for a control's value, shared by the generator
// (opening text) and the generated module (every write after that).

/** What a playground control can hold. */
export type ControlValue = boolean | string | readonly string[];

/** The list a value names: a plain string is one entry, an empty string none. */
export function heldList(value: string | readonly string[]): readonly string[] {
	if (typeof value !== 'string') return value;
	return value === '' ? [] : [value];
}

/** The list with `next` added when it is missing and removed when it is held. */
export function toggled(held: string | readonly string[], next: string): readonly string[] {
	const current = heldList(held);
	return current.includes(next) ? current.filter((one) => one !== next) : [...current, next];
}

function singleQuoted(text: string): string {
	return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** The value as the attribute's right-hand side: `"ship"`, `""`, `{['ship', 'returns']}`. */
export function valueText(value: string | readonly string[]): string {
	if (typeof value === 'string') return JSON.stringify(value);
	return `{[${value.map(singleQuoted).join(', ')}]}`;
}

/**
 * The whole attribute, or nothing when the value is the family's own default:
 * ` multiple`, ` collapsible={false}`, ` value="returns"`, ` value={['a', 'b']}`.
 */
export function attributeText(
	name: string,
	value: ControlValue,
	fallback: boolean | string,
	lead: string,
): string {
	if (typeof value === 'boolean') {
		if (value === fallback) return '';
		return value ? `${lead}${name}` : `${lead}${name}={false}`;
	}
	const list = heldList(value);
	if (typeof value === 'string' ? value === fallback : list.length === 0 && fallback === '')
		return '';
	return `${lead}${name}=${valueText(value)}`;
}

/** What a select trigger shows for the value: `ship, returns`, or `(none)`. */
export function listText(value: string | readonly string[]): string {
	const list = heldList(value);
	return list.length === 0 ? '(none)' : list.join(', ');
}

/**
 * The value the select holding the control is given. A list is written in a
 * form no option carries, so picking an option toggles membership instead of
 * being refused as already chosen.
 */
export function pickValue(value: string | readonly string[]): string {
	return typeof value === 'string' ? value : `[${value.join(', ')}]`;
}
