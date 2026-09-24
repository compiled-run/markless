// Attributes executed / unexecuted characters of a built JS file to its original sources through the file's
// source map (only when the build emitted one; production entrants usually do not).
const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));

function decodeMappings(mappings) {
	const lines = [];
	let source = 0;
	for (const line of mappings.split(';')) {
		const segs = [];
		let col = 0;
		for (const seg of line.split(',')) {
			if (!seg) continue;
			const vals = [];
			let value = 0;
			let shift = 0;
			for (const ch of seg) {
				const d = B64[ch];
				value += (d & 31) << shift;
				if (d & 32) shift += 5;
				else {
					vals.push(value & 1 ? -(value >>> 1) : value >>> 1);
					value = 0;
					shift = 0;
				}
			}
			col += vals[0];
			if (vals.length > 1) source += vals[1];
			segs.push([col, vals.length > 1 ? source : -1]);
		}
		lines.push(segs);
	}
	return lines;
}

export function sourceMapUrl(text) {
	return text.match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1] ?? null;
}

/**
 * masks: { name: Uint8Array } over the file's UTF-16 offsets. Returns [{ source, chars, [name]: count }]
 * sorted by `sortBy` descending; characters not covered by any mapping count under '(unmapped)'.
 */
export function attribute(text, map, masks, sortBy) {
	const lines = decodeMappings(map.mappings);
	const sources = map.sources ?? [];
	const out = new Map();
	const bucket = (i) => {
		const name = i >= 0 ? sources[i] ?? `#${i}` : '(unmapped)';
		let b = out.get(name);
		if (!b) out.set(name, (b = { source: name, chars: 0, ...Object.fromEntries(Object.keys(masks).map((k) => [k, 0])) }));
		return b;
	};
	let offset = 0;
	const textLines = text.split('\n');
	for (let li = 0; li < textLines.length; li++) {
		const len = textLines[li].length;
		const segs = lines[li] ?? [];
		let si = -1;
		for (let col = 0; col <= len; col++) {
			while (si + 1 < segs.length && segs[si + 1][0] <= col) si++;
			const b = bucket(si >= 0 ? segs[si][1] : -1);
			const at = offset + col;
			b.chars++;
			for (const [k, m] of Object.entries(masks)) if (m[at]) b[k]++;
		}
		offset += len + 1;
	}
	return [...out.values()].sort((a, b) => b[sortBy] - a[sortBy]);
}
