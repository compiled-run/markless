// null, undefined and false mean absent and true is bare, except aria-/data- names (true reads "true"); the names below spell false too.
export const ENUMERATED_BOOLEAN_ATTRIBUTE = /^(draggable|contenteditable|spellcheck)$/;

// The enumerated names, and the WAI-ARIA 1.2 states whose "false" differs from absent; aria-hidden="false" is unreliable in browsers, so it stays absent.
const SPELLS_FALSE =
	/^(draggable|contenteditable|spellcheck|aria-(atomic|busy|checked|current|disabled|expanded|grabbed|haspopup|invalid|modal|multi(line|selectable)|pressed|re(adonly|quired)|selected))$/;

export function marklessAttributeValue(name: string, value: unknown): string | null {
	if (value == null || (value === false && !SPELLS_FALSE.test(name))) return null;
	return value !== true || ENUMERATED_BOOLEAN_ATTRIBUTE.test(name) || /^(aria|data)-/.test(name)
		? String(value)
		: '';
}

type AttributeTarget = {
	setAttribute?(name: string, value: string): void;
	removeAttribute?(name: string): void;
	setAttributeNS?(namespace: string | null, name: string, value: string): void;
	removeAttributeNS?(namespace: string | null, localName: string): void;
	lookupNamespaceURI?(prefix: string): string | null;
};

// setAttribute('xlink:href') makes an attribute no SVG reader sees, so xlink: and xml: names are written in their namespace.
export function marklessWriteAttribute(
	element: AttributeTarget,
	name: string,
	text: string | null,
): void {
	const prefix = name.split(':')[0]!;
	const namespace =
		prefix === 'xlink'
			? 'http://www.w3.org/1999/xlink'
			: prefix === 'xml'
				? element.lookupNamespaceURI?.(prefix)
				: undefined;
	if (namespace && element.setAttributeNS) {
		if (text === null) element.removeAttributeNS!(namespace, name.slice(prefix.length + 1));
		else element.setAttributeNS(namespace, name, text);
	} else if (text === null) element.removeAttribute?.(name);
	else element.setAttribute?.(name, text);
}
