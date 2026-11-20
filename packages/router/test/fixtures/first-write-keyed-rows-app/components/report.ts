// What the line after a write sees: the rows in the DOM and in the row handle.
export function report(box: HTMLElement, rows: readonly HTMLElement[] | undefined, row = 'i') {
	const dom = [...box.querySelectorAll(row)].map((each) => each.textContent).join(',');
	const handle = (rows ?? [])
		.map((each) => `${each.tagName.toLowerCase()}:${each.textContent}`)
		.join(',');
	dispatchEvent(new CustomEvent('seen', { detail: `dom [${dom}] handle [${handle}]` }));
}
