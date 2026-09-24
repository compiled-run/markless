// V8 block coverage -> per-script executed-character masks, and the waste classification built on them.

/**
 * One Profiler.takePreciseCoverage script entry -> Uint8Array mask over the script's UTF-16 code units
 * (1 = executed). Ranges are painted outer-first so the innermost range decides each character.
 */
export function executedMask(functions, length) {
	const ranges = [];
	let end = length ?? 0;
	for (const fn of functions) for (const r of fn.ranges) {
		ranges.push(r);
		if (length == null) end = Math.max(end, r.endOffset);
	}
	ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
	const mask = new Uint8Array(end);
	for (const r of ranges) mask.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(end, r.endOffset));
	return mask;
}

/** Script length as V8 reports it: the widest range (the top-level function spans the whole script). */
export const scriptLength = (functions) => functions.reduce((m, fn) => fn.ranges.reduce((n, r) => Math.max(n, r.endOffset), m), 0);

export function orInto(target, mask) {
	const n = Math.min(target.length, mask.length);
	for (let i = 0; i < n; i++) if (mask[i]) target[i] = 1;
	return target;
}

export const countSet = (mask) => mask.reduce((a, v) => a + v, 0);

export function countOnlyIn(mask, exclude) {
	let n = 0;
	for (let i = 0; i < mask.length; i++) if (mask[i] && !exclude?.[i]) n++;
	return n;
}

/** Uncalled named functions of a script (for pointing a planner at the wasted code), largest first. */
export function uncalledFunctions(functions, mask, limit = 12) {
	const out = [];
	for (const fn of functions) {
		const r = fn.ranges[0];
		if (!r || r.count > 0 || r.startOffset === 0) continue;
		let hit = false;
		for (let i = r.startOffset; i < r.endOffset && !hit; i++) if (mask?.[i]) hit = true;
		if (!hit) out.push({ name: fn.functionName || '(anonymous)', chars: r.endOffset - r.startOffset, start: r.startOffset });
	}
	out.sort((a, b) => b.chars - a.chars);
	const outer = [];
	for (const f of out) if (!outer.some((o) => f.start >= o.start && f.start + f.chars <= o.start + o.chars)) outer.push(f);
	return outer.slice(0, limit);
}

/**
 * Splits a resource's bytes by the share of its characters in each class. `boot` and `control` are masks
 * (control may overlap boot; overlap counts as boot). Returns fractions and per-unit bytes.
 */
export function classify({ length, boot, control, sizes }) {
	if (!length) return { length: 0, fractions: { boot: 0, control: 0, never: 1 }, bytes: scale(sizes, { boot: 0, control: 0, never: 1 }) };
	const bootChars = boot ? countSet(boot) : 0;
	const controlChars = control ? countOnlyIn(control, boot) : 0;
	const fractions = { boot: bootChars / length, control: controlChars / length, never: Math.max(0, length - bootChars - controlChars) / length };
	return { length, chars: { boot: bootChars, control: controlChars }, fractions, bytes: scale(sizes, fractions) };
}

function scale(sizes, fractions) {
	const out = {};
	for (const [unit, total] of Object.entries(sizes)) out[unit] = { boot: total * fractions.boot, control: total * fractions.control, never: total * fractions.never, total };
	return out;
}
