type SelectorElement = {
	readonly tagName?: unknown;
	readonly id?: unknown;
	readonly className?: unknown;
	readonly classList?: { readonly length?: number; item?: (index: number) => string | null };
	readonly getAttribute?: (name: string) => string | null;
	readonly getAttributeNames?: () => string[];
};

export function describeMarklessEventTarget(target: unknown): string {
	if (!target || typeof target !== 'object') return 'event target';
	const element = target as SelectorElement;
	const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : 'element';
	const id = typeof element.id === 'string' && element.id ? `#${cssIdent(element.id)}` : '';
	const classes = classNames(element).slice(0, 2).map((name) => `.${cssIdent(name)}`).join('');
	const dataName = element.getAttributeNames?.().find((name) => /^data-[\w:-]+$/.test(name));
	const dataValue = dataName ? element.getAttribute?.(dataName) : null;
	const data = dataName ? dataValue ? `[${dataName}="${String(dataValue).replaceAll('"', '\\"')}"]` : `[${dataName}]` : '';
	return `${tag}${id}${classes}${data}`;
}

function classNames(element: SelectorElement): string[] {
	if (element.classList && typeof element.classList.length === 'number' && element.classList.item) {
		return Array.from({ length: element.classList.length }, (_, index) => element.classList?.item?.(index) ?? '').filter(Boolean);
	}
	return typeof element.className === 'string' ? element.className.split(/\s+/).filter(Boolean) : [];
}

function cssIdent(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
