// What the line after a write sees: the rows in the DOM and in the row handle.
export function report(box: HTMLElement, rows: readonly HTMLElement[] | undefined) {
	const dom = [...box.querySelectorAll('i')].map((row) => row.textContent).join(',');
	const handle = (rows ?? [])
		.map((row) => `${row.tagName.toLowerCase()}:${row.textContent}`)
		.join(',');
	dispatchEvent(new CustomEvent('seen', { detail: `dom [${dom}] handle [${handle}]` }));
}
