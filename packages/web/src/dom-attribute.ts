import { attributeText } from '@markless/serializer/attribute-text';

export { attributeText as marklessAttributeValue };

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
