// Pointer helpers the figure toys share.

/** Keeps a drag's pointer on the element that started it; a pointer the browser no longer tracks (a synthetic or ended touch) is left alone. */
export function capture(event: { readonly currentTarget: unknown; readonly pointerId: number }): void {
	try {
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	} catch {}
}
