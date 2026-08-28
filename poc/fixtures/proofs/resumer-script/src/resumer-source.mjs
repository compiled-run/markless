// Gzip budget for the event-only inline resumer, which is serialized whole into
// every SSR document. Restated from the original 700 B, which was set against
// the toy source below (347 B gzip) before the shipped resumer carried a real
// payload protocol or the cold-gesture wakes.
//
// Each line is the marginal gzip cost of cutting that feature out of the shipped
// resumer and re-minifying: they do not sum exactly, because gzip shares context
// between them, and the cross term is the remainder.
export const EVENT_ONLY_RESUMER_ATTRIBUTION = {
	// Locator map, event-record map, one capture listener per event name, and the
	// single import promise the module is demanded through.
	core: 583,
	// Event names reachable only through a keyed repeat, an async-boundary arm
	// record set, or a branch arm, plus the hatch for rows minted after boot.
	nestedRecords: 172,
	// Focus and hover wakes: a first gesture must not wait on a demand load.
	coldGesturePrimers: 293,
	// One import promise per root, so resumed gestures reach the dispatch queue
	// in the order they fired.
	fireOrderImportPromise: 7,
	gzipCrossTerm: 3,
};

export const EVENT_ONLY_RESUMER_TARGET_BYTES = Object.values(
	EVENT_ONLY_RESUMER_ATTRIBUTION,
).reduce((total, bytes) => total + bytes, 0);

// The proof-of-concept source below stays gated on the budget it was written to.
export const POC_EVENT_ONLY_RESUMER_TARGET_BYTES = 700;

export function eventOnlyResumerSource() {
	return `(() => {
	let d = document;
	let r = d.currentScript.closest('[data-async]');
	let v = JSON.parse(r.querySelector('script[type="markless/view"]').textContent);
	let w = d.createTreeWalker(r, 1);
	let n = [r];
	let x;
	while ((x = w.nextNode())) n.push(x);
	v[0].map((t) =>
		r.addEventListener(
			t,
			async (e) => {
				let k = v[0].indexOf(e.type);
				for (let a = e.target; a && a !== r; a = a.parentElement) {
					let i = n.indexOf(a);
					let h = v[1].find((h) => h[0] === i && h[1] === k);
					if (h) {
						await (await import(v[2][h[2]]))[v[3][h[3]]]({
							event: e,
							element: a,
							root: r,
						});
						break;
					}
				}
			},
			1,
		),
	);
})();`;
}
