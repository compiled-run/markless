// A pull request's required checks ticking on GitHub, then the merge queue testing the exact commit it lands on main.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.82;
const v = (row: number) => 2.6 + row * PITCH;

export const REQUIRED = ['test', 'typecheck', 'agent-files'];

export function drawing() {
	const prH = v(REQUIRED.length + 1) + 0.2;
	const k = desk(680, [
		{ key: 'pr', x: 0, y: 0, w: 13, h: prH, bar: 'browser', title: 'pull request' },
		{ key: 'queue', x: 7.5, y: prH + 3, w: 13, h: 4.2, folder: 'merge queue' },
		{ key: 'main', x: 1.5, y: prH + 10, w: 15, h: 3.4, curl: false },
	]);
	k.lay();
	k.row('pr', 1, v(0), 'Required checks', 'big');
	REQUIRED.forEach((name, i) => k.row('pr', 2.2, v(i + 1.2), name, 'mono'));
	k.row('queue', 1, 1.6, 'ci.yml runs again on', 'mono');
	k.row('queue', 1, 2.45, 'the exact commit it lands', 'mono');
	k.row('main', 1, 2, 'main', 'big');
	k.next();
	REQUIRED.forEach((name, i) => {
		k.tick('pr', 1.3, v(i + 1.2), 'draw', 400 + i * 500);
		k.swipe('pr', 2.1, k.col(2.2, name.length), v(i + 1.2), 'show', 400 + i * 500);
	});
	k.arrow(['pr', 12.2, v(2)], ['queue', 6, -1.5], 'draw', 2000, 1, true);
	k.tick('queue', 10.6, 2.45, 'draw', 3000);
	k.arrow(['queue', 3, 4.4], ['main', 6, 0.1], 'draw', 3400, -0.8, true);
	k.hand('main', 4.6, 2, 'ONLY FROM THE QUEUE', 'show', 4200);
	return k.build();
}
