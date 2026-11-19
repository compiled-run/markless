// Ranks the refusals in a measure.ts report by how many screens each blocks, and names which branch reports remove each:
// `node packages/mobile/apps/rank.ts <report.json> [<pr>=<branch report.json> ...]`.
import { readFileSync } from 'node:fs';
import type { Refusal, ScreenResult } from './measure.ts';

type Report = Record<string, ScreenResult[]>;

/** A refusal's kind: its code and message with the names it quotes (`parseNotes`, `title`) and node ids left out. */
export function refusalKind(refusal: Refusal): string {
	const message = refusal.message
		.split('`')
		.map((part, index) => (index % 2 === 1 ? '…' : part))
		.join('`')
		.split(' ')
		.map((word) => (word.startsWith('component-edge:') || /^h\d+$/.test(word) ? '#' : word))
		.join(' ');
	return `${refusal.code}: ${message}`;
}

function kindsByScreen(report: Report): Map<string, Set<string>> {
	const screens = new Map<string, Set<string>>();
	for (const [app, results] of Object.entries(report))
		for (const screen of results)
			screens.set(`${app} ${screen.route}`, new Set(screen.refusals.map(refusalKind)));
	return screens;
}

export function rank(report: Report, branches: ReadonlyMap<string, Report>) {
	const base = kindsByScreen(report);
	const blocked = new Map<string, string[]>();
	for (const [screen, kinds] of base)
		for (const kind of kinds) blocked.set(kind, [...(blocked.get(kind) ?? []), screen]);
	const branchKinds = new Map([...branches].map(([name, branch]) => [name, kindsByScreen(branch)]));
	return [...blocked]
		.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
		.map(([kind, screens]) => ({
			kind,
			screens,
			removedBy: [...branchKinds].flatMap(([name, kinds]) => {
				const gone = screens.filter((screen) => kinds.has(screen) && !kinds.get(screen)!.has(kind));
				return gone.length > 0 ? [{ branch: name, screens: gone.length }] : [];
			}),
		}));
}

if (import.meta.main) {
	const [reportFile, ...branchArgs] = process.argv.slice(2);
	if (!reportFile) throw new Error('usage: rank.ts <report.json> [<name>=<branch report.json> ...]');
	const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Report;
	const branches = new Map(
		branchArgs.map((arg) => {
			const at = arg.indexOf('=');
			return [arg.slice(0, at), read(arg.slice(at + 1))] as const;
		}),
	);
	console.log('| Screens blocked | Refusal | Removed on these branches (screens) |');
	console.log('| ---: | --- | --- |');
	for (const row of rank(read(reportFile), branches))
		console.log(
			`| ${row.screens.length} | ${row.kind.replaceAll('|', '\\|')} | ${row.removedBy.map((entry) => `${entry.branch} (${entry.screens})`).join(', ') || 'none'} |`,
		);
}
