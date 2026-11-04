// The repo's other top-level folders as folders on the desk, each with its job written inside, and the ones to skip crossed out.
import { desk, type SheetSpec } from '../ink/sheets.ts';

export const FOLDERS = [
	{ name: 'specs/', job: ['THE BEHAVIOR', 'CONTRACT'] },
	{ name: 'demos/', job: ['DEMO APPS'] },
	{ name: 'poc/', job: ['DESIGN', 'EVIDENCE'] },
	{ name: 'scripts/', job: ['CI, RELEASE,', 'BENCHMARKS'] },
	{ name: 'docs/', job: ['CI PROCESS,', 'CI FAILURES'] },
	{ name: '.ruler/', job: ['AGENT RULES', 'AND SKILLS'] },
	{ name: 'website/', job: ['THIS SITE'] },
];
export const SKIPPED = ['goals/', 'dist/', '.witness/'];

const W = 4.9;

export function drawing() {
	const specs: SheetSpec[] = FOLDERS.map((f, i) => ({ key: 'f' + i, x: (i % 4) * 5.4, y: Math.floor(i / 4) * 5, w: W, h: 3, folder: f.name }));
	specs.push({ key: 'skip', x: 3 * 5.4, y: 5, w: W, h: 3.4, curl: false });
	const k = desk(680, specs);
	k.lay();
	FOLDERS.forEach((f, i) => f.job.forEach((line, j) => k.hand('f' + i, 0.5, 1.2 + j * 0.8, line, 'show', 300 + i * 350)));
	SKIPPED.forEach((name, i) => {
		k.row('skip', 0.6, 1 + i * 0.85, name, 'mono');
		k.strike('skip', 0.6, k.col(0.6, name.length), 1 + i * 0.85, 'draw', 2900 + i * 200);
	});
	k.hand('skip', 3, 1.85, 'SKIP', 'show', 3500);
	return k.build();
}
