export const EVENT_ONLY_RESUMER_TARGET_BYTES = 700;

export function eventOnlyResumerSource() {
	return `(() => {
	let d = document;
	let r = d.currentScript.closest('[data-async]');
	let v = JSON.parse(r.querySelector('script[type="arcade/view"]').textContent);
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
