// The attribute presence rule every render and update path shares, compiled or live: null,
// undefined and false mean absent, true is the bare boolean form, except where the name takes the words.
const SPELLS_BOOLEANS = new Set(['draggable', 'contenteditable', 'spellcheck']);

export function spellsBooleans(name: string): boolean {
	return SPELLS_BOOLEANS.has(name);
}

export function attributeText(name: string, value: unknown): string | null {
	if (typeof value === 'boolean' && SPELLS_BOOLEANS.has(name)) return String(value);
	if (value == null || value === false) return null;
	if (value !== true) return String(value);
	return /^(aria|data)-/.test(name) ? 'true' : '';
}
