// The DOM/JSX attribute convention every render and update path shares: null,
// undefined and false mean the attribute is absent; true is the bare boolean
// form, except for aria-/data- names whose consumers parse the word "true".
// The compiler applies the same rule to values it already knows while
// compiling (see collect-markup.ts staticAttributeText).
export function marklessAttributeValue(name: string, value: unknown): string | null {
	if (value == null || value === false) return null;
	if (value !== true) return String(value);
	return /^(aria|data)-/.test(name) ? 'true' : '';
}
