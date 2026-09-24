import { BUDGETS, COST_MODEL, kb, msForGzipBytes } from './config.mjs';

const ACCEPT = 'pnpm perf:guard:accept';
const INVARIANT = 'This is an invariant, not an anchor: fix the regression; it cannot be accepted.';
const pct = (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;
const acceptHint = (guard, subject) =>
	`If this cost is intended, accept it with a one-line reason: ${ACCEPT} ${guard} "${subject}" --reason "<why>"`;

export const routeKey = (site, route) => `${site} ${route}`;
export const isLean = (path) => path !== 'full-resume';

/** Compares one measurement with the anchors; returns failures (block) and notes (informational). */
export function evaluate(measurement, anchors) {
	const failures = [];
	const notes = [];
	const known = new Map(
		(anchors.knownViolations ?? []).map((k) => [`${k.guard} ${k.subject}`, k.reason]),
	);
	const seenKnown = new Set();
	const note = (guard, message) => notes.push({ guard, message });
	const fail = (guard, message, subject) => {
		const reason = subject && known.get(`${guard} ${subject}`);
		if (!reason) return failures.push({ guard, message });
		seenKnown.add(`${guard} ${subject}`);
		note(guard, `KNOWN VIOLATION (${reason}): ${message}`);
	};

	for (const [site, siteResult] of Object.entries(measurement.sites)) {
		for (const [route, result] of Object.entries(siteResult.routes)) {
			const subject = routeKey(site, route);
			checkPreload(subject, result.preload, fail, note);
			checkFirstUse(subject, result.controls, fail, note);
			if (result.waste) checkWaste(subject, result.waste, note);
			if (result.payPerUse) checkPayPerUse(subject, result.payPerUse, fail, note);
		}
		if (siteResult.runtimeModules)
			checkRuntimeModules(site, siteResult, anchors.runtimeModules ?? {}, fail, note);
		if (siteResult.execution)
			for (const [name, cost] of Object.entries(siteResult.execution))
				checkExecution(name, cost, anchors.execution?.[name], fail, note);
		if (siteResult.lean) checkLean(siteResult.lean, anchors, fail, note);
		for (const probe of siteResult.sameTask ?? []) checkSameTask(probe, fail, note);
		if (siteResult.compileHints) checkCompileHints(siteResult.compileHints, fail, note);
		for (const nav of siteResult.navigation ?? []) checkNavigation(nav, fail, note);
		if (siteResult.chunkNameReferences)
			checkLocalRenames(site, siteResult.chunkNameReferences, fail, note);
	}
	if (measurement.constructGlue)
		checkConstructGlue(measurement.constructGlue, anchors.constructGlue ?? {}, fail, note);
	for (const key of known.keys())
		if (!seenKnown.has(key))
			note(
				key.split(' ')[0],
				`known violation "${key}" no longer occurs; remove it from knownViolations in anchors.json.`,
			);
	return { failures, notes };
}

const breakdown = (attribution) =>
	attribution
		? ` (${Object.entries(attribution)
				.filter(([, bytes]) => bytes > 0)
				.map(([category, bytes]) => `${category} ${kb(bytes)}`)
				.join(', ')})`
		: '';

function checkPreload(subject, preload, fail, note) {
	if (preload.missingFiles.length)
		fail(
			'G1',
			`${subject}: the page preloads files the build did not emit: ${preload.missingFiles.join(', ')}.`,
		);
	if (preload.rounds !== 1)
		fail(
			'G1',
			`${subject}: boot needs ${preload.rounds} serial fetch rounds (anchor: 1). Chain: ${preload.chain.join(' -> ')}; not preloaded: ${preload.notPreloaded.join(', ')}. Each extra round costs about ${COST_MODEL.msPerSerialRound} ms on a slow phone. ${INVARIANT}`,
			subject,
		);
	note(
		'G1',
		`${subject}: critical path ${kb(preload.gzipBytes)} gzip in ${preload.files.length} files${breakdown(preload.attribution)} ≈ ${msForGzipBytes(preload.gzipBytes).toFixed(0)} ms on a slow phone. Informational: app size is not gated; the framework's share is gated by G10-G12.`,
	);
}

function checkFirstUse(subject, controls, fail, note) {
	if (controls.length === 0) {
		fail(
			'G2',
			`${subject}: no usable control found, so the zero click-time JS check covered nothing.`,
		);
		return;
	}
	for (const control of controls) {
		if (control.missing) {
			note('G2', `${subject}: control "${control.key}" was not found again on a fresh page.`);
			continue;
		}
		if (control.navigated) {
			note(
				'G2',
				`${subject}: "${control.key}" loaded a new document; its requests are a page load, not a first use.`,
			);
			continue;
		}
		if (control.inputError)
			fail(
				'G2',
				`${subject}: the guard could not use "${control.key}" (${control.inputError}), so its first use went unchecked; fix the control or the guard's control handling.`,
				`${subject} ${control.key}`,
			);
		if (control.inputJs.length)
			fail(
				'G2',
				`${subject}: first ${control.kind} on "${control.key}" fetched ${control.inputJs.length} JS file(s) after the input: ${control.inputJs.join(', ')}. A fetch at input costs at least one round trip (about ${COST_MODEL.msPerSerialRound} ms on a slow phone). ${INVARIANT}`,
				`${subject} ${control.key}`,
			);
		if (control.errors.length)
			note('G2', `${subject}: "${control.key}" reported: ${control.errors.join(' | ')}`);
	}
	note(
		'G2',
		`${subject}: ${controls.length} distinct controls, first use fetched no JS unless listed above.`,
	);
}

function checkWaste(subject, waste, note) {
	const top = waste.files
		.slice(0, 3)
		.map((f) => `${f.file} ${kb(f.neverGzipBytes)}`)
		.join(', ');
	note(
		'G6',
		`${subject}: preloaded but never executed by load or any control: ${kb(waste.gzipBytes)} gzip ≈ ${msForGzipBytes(waste.gzipBytes).toFixed(0)} ms of boot download on a slow phone. Informational (it grows with app code). Largest: ${top}`,
	);
}

function featureOf(id, features) {
	const labels = features?.[id];
	return labels?.length
		? `runtime feature module ${id} (demanded by ${labels.join(', ')})`
		: `runtime module ${id} (framework infrastructure no compiled record names)`;
}

function checkRuntimeModules(site, siteResult, anchors, fail, note) {
	const sizes = siteResult.runtimeModules;
	const features = siteResult.runtimeFeatures;
	let total = 0;
	for (const [id, bytes] of Object.entries(sizes)) {
		total += bytes;
		const anchor = anchors[id];
		if (anchor === undefined) {
			fail(
				'G10',
				`${site}: new ${featureOf(id, features)} ships ${bytes} B (rendered, before minification) with no per-feature anchor. ${acceptHint('runtime', id)}`,
			);
			continue;
		}
		const delta = bytes - anchor;
		if (delta > BUDGETS.runtimeModuleGrowthBytes)
			fail(
				'G10',
				`${site}: ${featureOf(id, features)} got heavier: ${anchor} -> ${bytes} B (+${delta} B rendered, budget +${BUDGETS.runtimeModuleGrowthBytes} B). Every page that uses this feature pays it. ${acceptHint('runtime', id)}`,
			);
		else if (delta < -BUDGETS.runtimeModuleGrowthBytes)
			note(
				'G10',
				`${site}: ${id} shrank ${anchor} -> ${bytes} B; lock the win in with ${ACCEPT} runtime "${id}" --reason "<why>"`,
			);
	}
	for (const id of Object.keys(anchors))
		if (sizes[id] === undefined)
			note(
				'G10',
				`${site}: runtime module ${id} no longer ships; drop its anchor with ${ACCEPT} runtime "${id}" --reason "<why>"`,
			);
	note(
		'G10',
		`${site}: ${Object.keys(sizes).length} framework runtime modules, ${kb(total)} rendered, each within +${BUDGETS.runtimeModuleGrowthBytes} B of its anchor unless listed.`,
	);
}

function checkPayPerUse(subject, payPerUse, fail, note) {
	for (const id of payPerUse.undemanded)
		fail(
			'G11',
			`${subject}: runtime feature module ${id} ships in the page's download, but no compiled demand of the page's own modules (${payPerUse.pageMaps.join(', ') || 'none found'}) names it. A page must pay only for features it uses. ${INVARIANT}`,
			`${subject} ${id}`,
		);
	note(
		'G11',
		`${subject}: ${payPerUse.shipped} runtime modules in the download; judged ${payPerUse.judged ?? 'all features'} against ${payPerUse.pageMaps.length} page demand map(s), every judged feature module demanded unless listed.`,
	);
}

function checkConstructGlue(glue, anchors, fail, note) {
	for (const [construct, cost] of Object.entries(glue)) {
		const anchor = anchors[construct];
		if (anchor === undefined) {
			fail(
				'G12',
				`${construct}: no emitted-glue anchor recorded (${cost.bytesPerInstance} B per instance). ${acceptHint('construct', construct)}`,
			);
			continue;
		}
		const delta = cost.bytesPerInstance - anchor;
		const line = `${construct}: the compiler emits ${cost.bytesPerInstance} B of glue per instance on the minimal fixture, anchor ${anchor} B`;
		if (delta > BUDGETS.constructGlueGrowthBytes)
			fail(
				'G12',
				`${line}: +${delta} B per ${construct} (budget +${BUDGETS.constructGlueGrowthBytes} B). Every ${construct} in every app pays it. ${acceptHint('construct', construct)}`,
			);
		else note('G12', line);
	}
}

function checkExecution(name, cost, anchor, fail, note) {
	const subject = `${name} (${cost.caseId} on ${cost.route})`;
	if (cost.inputJs.length)
		fail(
			'G3',
			`${subject}: the first use fetched JS: ${cost.inputJs.join(', ')}. ${INVARIANT}`,
		);
	if (!anchor) {
		fail('G3', `${subject}: no execution anchor recorded. ${acceptHint('execution', name)}`);
		return;
	}
	const growth = anchor.executedChars ? cost.executedChars / anchor.executedChars - 1 : 0;
	const extraModules = cost.modules - anchor.modules;
	const line = `${subject}: runs ${kb(cost.executedChars)} of JS source in ${cost.functions} functions and ${cost.modules} module initializers between input and response; anchor ${kb(anchor.executedChars)} / ${anchor.functions} / ${anchor.modules} (${pct(growth)} source)`;
	const tooMuchSource =
		growth > BUDGETS.executionGrowth &&
		cost.executedChars - anchor.executedChars > BUDGETS.executionMinChars;
	const tooManyModules =
		extraModules >
		Math.max(BUDGETS.initializerMinExtra, anchor.modules * BUDGETS.executionGrowth);
	if (tooMuchSource || tooManyModules) {
		const why = tooMuchSource
			? `executed source grew ${pct(growth)} (budget ${pct(BUDGETS.executionGrowth)})`
			: `${extraModules} more module initializers run at first use`;
		const scripts = cost.scripts
			.slice()
			.sort((a, b) => b.executedChars - a.executedChars)
			.slice(0, 4)
			.map((s) => `${s.url} ${kb(s.executedChars)}`)
			.join(', ');
		const initialized = cost.scripts.flatMap((s) => s.initialized ?? []);
		const modules = initialized.length
			? ` Modules initialized: ${initialized.join(', ')}.`
			: '';
		fail(
			'G3',
			`${line}. ${why}; this is main-thread work the reader waits through before the response. Largest: ${scripts}.${modules} ${acceptHint('execution', name)}`,
		);
	} else note('G3', line);
}

function checkLean(lean, anchors, fail, note) {
	const allowed = new Set((anchors.allowFullResume ?? []).map((a) => `${a.route} ${a.action}`));
	for (const [route, actions] of Object.entries(lean)) {
		const anchored = anchors.lean?.[route];
		const leanNow = Object.entries(actions).filter(([, path]) => isLean(path));
		const full = Object.entries(actions)
			.filter(([, path]) => !isLean(path))
			.map(([name]) => name);
		note(
			'G4',
			`bench ${route}: ${leanNow.length}/${Object.keys(actions).length} actions on lean paths; full resume: ${full.join(', ') || 'none'}`,
		);
		if (!anchored) {
			fail(
				'G4',
				`bench ${route}: no lean-dispatch anchor recorded. ${acceptHint('lean', route)}`,
			);
			continue;
		}
		for (const name of anchored) {
			const path = actions[name];
			if (path === undefined) {
				note(
					'G4',
					`bench ${route}: lean action "${name}" is no longer in the demand map (renamed or removed).`,
				);
				continue;
			}
			if (isLean(path) || allowed.has(`${route} ${name}`)) continue;
			fail(
				'G4',
				`bench ${route}: action "${name}" moved from a lean dispatch path to full resume, so its first use now boots the whole runtime (the counter measured 57 -> 46 ms early / 28 -> 12 ms settled when it went lean). If this is intended, allow it with a reason: ${ACCEPT} lean "${route}" --reason "<why>"`,
			);
		}
		const gained = leanNow.map(([name]) => name).filter((name) => !anchored.includes(name));
		if (gained.length)
			note(
				'G4',
				`bench ${route}: newly lean ${gained.join(', ')}; lock the gain in with ${ACCEPT} lean "${route}" --reason "<why>"`,
			);
	}
}

function checkSameTask(probe, fail, note) {
	if (!probe.sawEvent) {
		fail(
			'G5',
			`bench ${probe.route}: the probe never saw the ${probe.event} event for "${probe.name}"; the guard lost its subject.`,
		);
		return;
	}
	if (probe.sameTask)
		note(
			'G5',
			`bench ${probe.route}: "${probe.name}" (${probe.event}) reached the DOM in the input's task.`,
		);
	else
		fail(
			'G5',
			`bench ${probe.route}: after the runtime started, "${probe.name}" (${probe.event}) ${probe.responded ? 'changed the DOM only after another task ran' : 'never changed the DOM'}; a task hop between input and handler lets the browser run a frame first (the records dialog measured 79 -> 52 ms when this was removed). ${INVARIANT}`,
			`bench ${probe.route} ${probe.name}`,
		);
}

function checkCompileHints(hints, fail, note) {
	note(
		'G7',
		`bench: eager compile hint on ${hints.hinted.length} preloaded packs: ${hints.hinted.join(', ')}`,
	);
	if (hints.hintedNotPreloaded.length)
		fail(
			'G7',
			`bench: the eager compile hint is on files no route preloads: ${hints.hintedNotPreloaded.join(', ')}; it makes the browser compile code the page may never run. ${INVARIANT}`,
		);
	if (hints.hinted.length === 0)
		fail(
			'G7',
			`bench: no preloaded pack carries the eager compile hint any more (it removed ~15 ms of click-time compile in Chromium). ${INVARIANT}`,
		);
}

function checkNavigation(nav, fail, note) {
	if (nav.rounds === 1 && nav.documents === 0)
		note(
			'G8',
			`bench ${nav.from} -> ${nav.to}: ${nav.fetched.length} JS files, all fetched in one round.`,
		);
	if (nav.documents > 0)
		fail(
			'G8',
			`bench ${nav.from} -> ${nav.to}: the link loaded a new document instead of navigating on the client. ${INVARIANT}`,
			`bench ${nav.from} -> ${nav.to}`,
		);
	if (nav.rounds !== 1) {
		const chained = nav.fetched
			.filter((f) => f.round > 1)
			.map((f) => `${f.file} (round ${f.round}, imported by ${f.via.join(', ')})`);
		fail(
			'G8',
			`bench ${nav.from} -> ${nav.to}: navigation fetched JS in ${nav.rounds} serial rounds (anchor: 1): ${chained.join(', ')} were discovered only after another file arrived. Each extra round costs about ${COST_MODEL.msPerSerialRound} ms on a slow phone. ${INVARIANT}`,
			`bench ${nav.from} -> ${nav.to}`,
		);
	}
}

function checkLocalRenames(site, references, fail, note) {
	if (references.length === 0) {
		note(
			'G9',
			`${site}: no chunk names another chunk's file; an edit renames only the chunks whose bytes changed.`,
		);
		return;
	}
	fail(
		'G9',
		`${site}: ${references.map((r) => `${r.file} names ${r.names.join(', ')}`).join('; ')}. A chunk that names another chunk's hashed file is re-downloaded whenever that file changes, so one edit re-fetches its importers too (a one-line shared edit re-downloaded 302 of 336 KB on the docs home page before chunks imported each other through the import map). ${INVARIANT}`,
		`${site} chunk names`,
	);
}

export function formatReport({ failures, notes }) {
	const lines = [];
	for (const n of notes) lines.push(`  ok   [${n.guard}] ${n.message}`);
	for (const f of failures) lines.push(`  FAIL [${f.guard}] ${f.message}`);
	lines.push(
		failures.length
			? `${failures.length} performance guard failure(s).`
			: 'All performance guards hold.',
	);
	return lines.join('\n');
}
