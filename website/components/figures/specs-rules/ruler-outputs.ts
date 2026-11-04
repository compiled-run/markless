// The .ruler/ folder, the pnpm rules terminal, and the files it writes; agent-files fails when those drift from .ruler/.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.8;
const v = (row: number) => 1.6 + row * PITCH;

export const SOURCES = ['AGENTS.md', 'claude.md', 'ruler.toml', 'skills/'];
export const OUTPUTS = ['AGENTS.md', 'CLAUDE.md', 'the skill copies', 'the MCP configuration'];

export function drawing() {
	const k = desk(680, [
		{ key: 'ruler', x: 0, y: 0, w: 9.6, h: v(SOURCES.length) + 0.3, folder: '.ruler/' },
		{ key: 'term', x: 11, y: 0.4, w: 10, h: 3.6, bar: 'terminal', curl: false },
		{ key: 'out', x: 6, y: v(SOURCES.length) + 2.6, w: 15, h: v(OUTPUTS.length) + 1.2 },
	]);
	k.lay();
	SOURCES.forEach((name, i) => k.row('ruler', 1, v(i), name, 'mono'));
	k.row('term', 0.9, 2.6, '$', 'dim');
	k.row('term', 1.6, 2.6, 'pnpm rules', 'bold');
	OUTPUTS.forEach((name, i) => k.row('out', 1.2, v(i), name, i < 2 ? 'mono' : 'ui'));
	k.next();
	k.arrow(['ruler', 9.2, v(1)], ['term', 0.2, 2.4], 'draw', 200, 0.6, true);
	k.arrow(['term', 6, 3.7], ['out', 9, -0.3], 'draw', 900, -0.6, true);
	OUTPUTS.forEach((_, i) => k.tick('out', 0.6, v(i), 'draw', 1500 + i * 250));
	k.hand('out', 1.2, v(OUTPUTS.length) + 0.1, 'NEVER EDIT THESE BY HAND', 'show', 2600);
	k.hand('out', 9.4, v(0), 'agent-files FAILS', 'show', 3200);
	k.hand('out', 9.4, v(1), 'IF THEY DRIFT', 'show', 3200);
	return k.build();
}
