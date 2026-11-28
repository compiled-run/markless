/** Marks the inert JSON list of swap modules a press fetches, served only on a page that keeps state across a navigation. */
export const SWAP_MODULES_SCRIPT_ATTRIBUTE = 'data-markless-swap-modules';

// Served only on a page with a kept part with state or live shared() state (must not reference anything outside its own body):
// a press, or a mouse resting on a link, fetches what the swap imports leaving that page, from the record the page shown carries.
export function fetchSwapModulesAtPress(d: Document, recordAttribute: string, dwellMs: number): void {
	const host = d as Document & { __mSP?: boolean };
	if (host.__mSP) return;
	host.__mSP = true;
	const w = d.defaultView!;
	const anchorOf = (event: Event) => {
		const target = (event.composedPath()[0] ?? event.target) as Node;
		return (
			target.nodeType === 1 ? (target as Element) : target.parentElement
		)?.closest<HTMLAnchorElement>('a[href]');
	};
	const fetchFor = (anchor: HTMLAnchorElement | null | undefined) => {
		const record = d.querySelector(`script[${recordAttribute}]`);
		if (!record || !anchor || anchor.hasAttribute('download')) return;
		if (anchor.target && anchor.target !== '_self') return;
		const url = new URL(anchor.href, d.baseURI);
		const here = w.location;
		if (url.origin !== here.origin || url.pathname + url.search === here.pathname + here.search)
			return;
		const present = new Set(
			[...d.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((link) => link.href),
		);
		for (const href of JSON.parse(record.textContent!) as string[]) {
			const link = d.createElement('link');
			link.rel = 'modulepreload';
			link.crossOrigin = 'anonymous';
			link.href = new URL(href, d.baseURI).href;
			if (!present.has(link.href)) d.head.appendChild(link);
		}
	};
	const options = { capture: true, passive: true };
	for (const type of ['pointerdown', 'touchstart', 'focusin'])
		d.addEventListener(type, (event) => fetchFor(anchorOf(event)), options);
	let rest = 0;
	d.addEventListener(
		'pointerover',
		(event) => {
			w.clearTimeout(rest);
			const anchor = (event as PointerEvent).pointerType === 'mouse' && anchorOf(event);
			if (anchor) rest = w.setTimeout(() => fetchFor(anchor), dwellMs);
		},
		options,
	);
	d.addEventListener('pointerout', () => w.clearTimeout(rest), options);
}
