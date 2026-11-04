// The specs/ folder open on the desk: the index sheet on top, one file per area beneath, the deferred list ringed and the archive struck out.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.78;
const v = (row: number) => 1.5 + row * PITCH;

/** What `specs/` holds, as listed in the repo. */
export const AREAS = [
	'framework/00-overview.md',
	'framework/01-tsrx-host-contract.md',
	'framework/02-compiler-pipeline.md',
	'framework/03-state-graph.md',
	'framework/…',
	'framework/07-diagnostics.md',
	'framework/08-deferred-decisions.md',
	'framework/…',
	'framework/14-emission-codegen-migration.md',
	'framework/archive/',
	'router/',
];

export function drawing() {
	const folderH = v(AREAS.length) + 0.6;
	const k = desk(680, [
		{ key: 'folder', x: 0, y: 0, w: 21, h: folderH, folder: 'specs/' },
		{ key: 'index', x: 11.5, y: -1.8, w: 9.6, h: 3.4, turn: 0.03, curl: false },
	]);
	k.lay();
	AREAS.forEach((name, i) => k.row('folder', 1.5, v(i), name, 'mono'));
	k.row('index', 0.8, 1.5, 'framework-design.md', 'bold');
	k.row('index', 0.8, 2.4, 'the index', 'dim');
	k.next();
	k.hand('index', 4.6, 2.4, 'READ FIRST', 'show', 300);
	k.swipe('index', 0.7, k.col(0.8, 19), 1.5, 'show', 300);
	const deferred = AREAS.indexOf('framework/08-deferred-decisions.md');
	k.ring('folder', k.col(1.5, 10), k.col(1.5, AREAS[deferred]!.length), v(deferred), 'draw', 1000, 0.46);
	k.hand('folder', 12.8, v(deferred), 'OPEN ON PURPOSE', 'show', 1300);
	k.bracket('folder', 0.6, v(0), v(8), 'draw', 1900);
	k.hand('folder', 13.6, v(3), 'ONE AREA EACH', 'show', 2100);
	const archive = AREAS.indexOf('framework/archive/');
	k.strike('folder', 1.4, k.col(1.5, AREAS[archive]!.length), v(archive) - 0.05, 'draw', 2700);
	k.hand('folder', 8, v(archive), 'HISTORY, NOT THE CONTRACT', 'show', 2900);
	return k.build();
}
