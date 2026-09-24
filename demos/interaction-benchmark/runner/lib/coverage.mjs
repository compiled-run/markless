// V8 precise block coverage for one Chromium page: executed-character masks per script and the
// per-window counts the performance guards read (executed chars, functions called, module initializers).

/** Starts precise coverage on the page's own CDP session; call before the first navigation. */
export async function startCoverage(context, page) {
	const cdp = await context.newCDPSession(page);
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
	return {
		/** Scripts executed since the previous take; V8 resets its counters on every take. */
		async take() {
			const { result } = await cdp.send('Profiler.takePreciseCoverage');
			return result.filter((script) => /^https?:/.test(script.url));
		},
		async stop() {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
		},
	};
}

/** Script length as V8 reports it: the widest range (the top-level function spans the script). */
export const scriptLength = (functions) =>
	functions.reduce((max, fn) => fn.ranges.reduce((m, r) => Math.max(m, r.endOffset), max), 0);

/** One script's coverage -> Uint8Array over its characters, 1 = executed; innermost range decides. */
export function executedMask(functions, length = scriptLength(functions)) {
	const ranges = functions.flatMap((fn) => fn.ranges);
	ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
	const mask = new Uint8Array(length);
	for (const r of ranges)
		mask.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(length, r.endOffset));
	return mask;
}

export const countSet = (mask) => mask.reduce((total, bit) => total + bit, 0);

export function orInto(target, mask) {
	const n = Math.min(target.length, mask.length);
	for (let i = 0; i < n; i++) if (mask[i]) target[i] = 1;
	return target;
}

const ran = (fn) => (fn.ranges[0]?.count ?? 0) > 0;
const escape = (text) => text.replaceAll('$', '\\$');

/**
 * Offsets of Rolldown's lazy ESM init wrappers (`init_x = __esmMin(() => ...)`, minified to
 * `xe=e((()=>...))`) -> module name (from the chunk's `xe as init_x` export when it has one).
 */
export function lazyInitOffsets(code) {
	const aliases = new Set([
		'__esmMin',
		...[...code.matchAll(/__esmMin as ([\w$]+)/g)].map((m) => m[1]),
	]);
	const exported = new Map(
		[...code.matchAll(/\b([\w$]+) as (init_[\w$]+)/g)].map((m) => [m[1], m[2]]),
	);
	const offsets = new Map();
	for (const alias of aliases) {
		const definition = new RegExp(
			`(?<![\\w$])([\\w$]+)\\s*=\\s*${escape(alias)}\\(\\s*\\(?\\s*(\\(\\)\\s*=>)`,
			'dg',
		);
		for (const match of code.matchAll(definition)) {
			const name = exported.get(match[1]) ?? match[1];
			offsets.set(match.indices[2][0], name.replace(/^init_/, ''));
		}
	}
	return offsets;
}

/**
 * Execution inside one coverage window, per script and in total. `initOffsets(url)` names the lazy
 * module initializers of a script; a script's own top-level run counts as one initializer too.
 */
export function windowExecution(scripts, initOffsets = () => new Map()) {
	const perScript = [];
	for (const script of scripts) {
		const executedChars = countSet(executedMask(script.functions));
		const offsets = initOffsets(script.url);
		const called = script.functions.filter((fn) => fn.ranges[0]?.startOffset !== 0 && ran(fn));
		const initialized = called.flatMap((fn) => {
			const name = offsets.get(fn.ranges[0].startOffset);
			return name ? [name] : [];
		});
		const topLevel = script.functions.some((fn) => fn.ranges[0]?.startOffset === 0 && ran(fn));
		const modules = (topLevel ? 1 : 0) + initialized.length;
		if (executedChars === 0 && called.length === 0 && modules === 0) continue;
		perScript.push({
			url: script.url,
			executedChars,
			functions: called.length,
			modules,
			initialized,
		});
	}
	return {
		executedChars: perScript.reduce((t, s) => t + s.executedChars, 0),
		functions: perScript.reduce((t, s) => t + s.functions, 0),
		modules: perScript.reduce((t, s) => t + s.modules, 0),
		perScript,
	};
}
