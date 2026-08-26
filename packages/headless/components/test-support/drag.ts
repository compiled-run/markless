// Drag gestures a browser test can make. A real drag carries files from outside
// the page and no automation driver can start one, so these dispatch the same
// events the browser would with a DataTransfer the test built. What that cannot
// witness is the drag data store going protected when a real drag ends; the
// fileupload note carries that limit.

export function fileOf(name: string, type = 'text/plain', body = 'x'): File {
	return new File([body], name, { type, lastModified: 1_700_000_000_000 });
}

export function transferOf(...files: readonly File[]): DataTransfer {
	const transfer = new DataTransfer();
	for (const file of files) transfer.items.add(file);
	return transfer;
}

function dragEvent(type: string, transfer: DataTransfer, at?: { x: number; y: number }): DragEvent {
	return new DragEvent(type, {
		bubbles: true,
		cancelable: true,
		dataTransfer: transfer,
		clientX: at?.x ?? 0,
		clientY: at?.y ?? 0,
	});
}

/** A drag arriving over the element. Returns the transfer so a drop can reuse it. */
export function dragEnter(element: Element, transfer = new DataTransfer()): DataTransfer {
	const box = element.getBoundingClientRect();
	const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	element.dispatchEvent(dragEvent('dragenter', transfer, at));
	element.dispatchEvent(dragEvent('dragover', transfer, at));
	return transfer;
}

/** A drag leaving for a point outside the element's own box. */
export function dragLeaveOutside(element: Element, transfer = new DataTransfer()): void {
	const box = element.getBoundingClientRect();
	element.dispatchEvent(dragEvent('dragleave', transfer, { x: box.right + 40, y: box.bottom + 40 }));
}

/** A drag crossing onto a child: dragleave fires on the area, pointer still inside it. */
export function dragLeaveOntoChild(element: Element, transfer = new DataTransfer()): void {
	const box = element.getBoundingClientRect();
	element.dispatchEvent(
		dragEvent('dragleave', transfer, { x: box.left + box.width / 2, y: box.top + box.height / 2 }),
	);
}

/** The whole gesture: arrive over the element, then let go of the files on it. */
export function dropOn(element: Element, ...files: readonly File[]): void {
	const transfer = dragEnter(element, transferOf(...files));
	const box = element.getBoundingClientRect();
	element.dispatchEvent(
		dragEvent('drop', transfer, { x: box.left + box.width / 2, y: box.top + box.height / 2 }),
	);
}
