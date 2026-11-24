// `--held-check`: a pressed state lasts only while a finger is down, so it is checked while one is. A Maestro long press holds the
// element's text in the background; meanwhile the host's layout dump must name the interaction state whose `:active` matches the
// rung's node, and once the finger lifts, the page's assignment again.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { exec } from './exec.ts';
import { ANDROID_SHELL_ACTIVITY, PROOF_APP_ID, PROOF_STYLE_PATH, type ProofPlatform } from './proof-app.ts';
import type { ProofRung } from './rung.ts';

type Level = { readonly states: readonly unknown[]; readonly matches: readonly { readonly active: readonly string[]; readonly focus: string | null; readonly hover: readonly string[] }[] };
type Dump = { readonly assignment: number; readonly shown?: number };

/** The entry of the state of `level` in which only `node`'s chain is active: the states follow the assignments, level by level. */
export function pressedEntry(style: Uint8Array, assignment: number, node: string): number {
	const parsed = JSON.parse(new TextDecoder().decode(style)) as { targets: Record<string, { routes: { assignments: unknown[]; interaction?: { levels: Level[] } }[] }> };
	const route = Object.values(parsed.targets)[0]?.routes[0];
	const levels = route?.interaction?.levels;
	if (route === undefined || levels === undefined) throw new Error('the style export has no interaction states');
	let entry = route.assignments.length;
	for (const [i, level] of levels.entries()) {
		for (const m of level.matches) {
			if (i === assignment && m.active.includes(node) && m.focus === null && m.hover.length === 0) return entry;
			entry++;
		}
	}
	throw new Error(`assignment ${assignment} has no state in which only ${node} is pressed`);
}

const holdFlow = (text: string) => `appId: ${PROOF_APP_ID}\n---\n- longPressOn: ${JSON.stringify(text)}\n`;

/** The failures of the rung's held checks on one device, empty when every one passes. */
export async function heldCheck(input: {
	readonly platform: ProofPlatform;
	readonly device: string;
	readonly adb?: string;
	readonly rung: ProofRung;
	readonly work: string;
}): Promise<string[]> {
	const held = input.rung.expected.held ?? [];
	if (held.length === 0) return [];
	const style = input.rung.assets[input.platform].get(PROOF_STYLE_PATH);
	if (style === undefined) return ['a held check needs a styled page'];
	mkdirSync(input.work, { recursive: true });
	const failures: string[] = [];
	for (const { text, node } of held) {
		const read = await openWithDump(input);
		const before = await settled(read);
		const want = pressedEntry(style, before.assignment, node);
		const flow = join(input.work, 'hold.yaml');
		writeFileSync(flow, holdFlow(text));
		// The long press runs while the dump is read: Maestro holds about 3 s.
		const hold = spawn('maestro', ['--device', input.device, 'test', '--no-reinstall-driver', flow], { stdio: 'ignore' });
		const done = new Promise<number | null>((resolve) => hold.on('exit', resolve));
		let pressed: Dump | null = null;
		const started = Date.now();
		while (pressed === null && Date.now() - started < 20_000) {
			const dump = await read();
			if (dump !== null && dump.shown === want) pressed = dump;
			else await sleep(100);
		}
		const code = await done;
		if (code !== 0) failures.push(`${text}: Maestro's long press exited ${code}`);
		if (pressed === null) failures.push(`${text}: while held, the page never showed state entry ${want} (${node} pressed)`);
		await sleep(1_000);
		const after = await read();
		if (after === null || after.shown !== after.assignment)
			failures.push(`${text}: after the finger lifted the page shows entry ${after?.shown}, not its assignment ${after?.assignment}`);
	}
	return failures;
}

/** Relaunches the app with its layout dump on and returns a reader of the dump. */
async function openWithDump(input: { readonly platform: ProofPlatform; readonly device: string; readonly adb?: string; readonly work: string }): Promise<() => Promise<Dump | null>> {
	if (input.platform === 'ios') {
		await exec('xcrun', ['simctl', 'terminate', input.device, PROOF_APP_ID], { allowFailure: true });
		const container = (await exec('xcrun', ['simctl', 'get_app_container', input.device, PROOF_APP_ID, 'data'])).stdout.trim();
		const file = join(container, 'Documents', 'markless-layout.json');
		rmSync(file, { force: true });
		await exec('xcrun', ['simctl', 'launch', input.device, PROOF_APP_ID, '-markless-layout-dump']);
		return async () => (existsSync(file) ? parse(readFileSync(file, 'utf8')) : null);
	}
	const adb = input.adb ?? 'adb';
	await exec(adb, ['-s', input.device, 'shell', 'am', 'force-stop', PROOF_APP_ID]);
	const remote = `/sdcard/Android/data/${PROOF_APP_ID}/files/markless-layout.json`;
	await exec(adb, ['-s', input.device, 'shell', 'rm', '-f', remote]);
	await exec(adb, ['-s', input.device, 'shell', 'am', 'start', '-W', '-n', `${PROOF_APP_ID}/${ANDROID_SHELL_ACTIVITY}`, '--ez', 'markless-layout-dump', 'true']);
	return async () => {
		const out = await exec(adb, ['-s', input.device, 'shell', 'cat', remote], { allowFailure: true });
		return out.code === 0 ? parse(out.stdout) : null;
	};
}

function parse(text: string): Dump | null {
	try {
		return JSON.parse(text) as Dump;
	} catch {
		return null;
	}
}

async function settled(read: () => Promise<Dump | null>): Promise<Dump> {
	const started = Date.now();
	while (Date.now() - started < 30_000) {
		const dump = await read();
		if (dump !== null) return dump;
		await sleep(250);
	}
	throw new Error('the app wrote no layout dump within 30 s');
}
