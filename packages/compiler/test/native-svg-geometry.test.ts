import { describe, expect, it } from 'vitest';
import { parsePathData, parseNumberList } from '../src/passes/native-drawing.ts';
import { SVG_GEOMETRY_SOURCE } from '../src/passes/native-svg-geometry.ts';

// The engine's copy of the svg grammars, run here as a phone's engine runs it.
const engine = new Function(`${SVG_GEOMETRY_SOURCE}\nreturn { path: __svgPath, viewBox: __svgViewBox };`)() as {
	path: (d: unknown) => string;
	viewBox: (text: unknown) => string | null;
};

const PATHS = [
	'M 0 0 h 1 v 1 h -1 z M 2 0 h 1 v 1 h -1 z',
	'M10 10L20 20H5V8z',
	'm1,2 l3,4 3,4 h-2 v-2 z',
	'M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12z',
	'M0 0Q5 10 10 0T20 0',
	'M0,0q5,10,10,0t10,0',
	'M8 1a7 7 0 1 0 0 14A7 7 0 1 0 8 1z',
	'M0 0A10 5 30 0 1 20 10',
	'M0 0a0 5 0 0 1 10 10',
	'M.5.5L1e1 1.5e1',
	'M0 0L10',
	'L10 10',
	'M0 0 X 5',
	'',
];

describe("the engine's svg grammars", () => {
	for (const d of PATHS)
		it(`draws ${JSON.stringify(d)} as the compiler does`, () => {
			expect(engine.path(d)).toBe(parsePathData(d).outline.join(' '));
		});

	it('reads a viewBox as the compiler does, and none without area', () => {
		for (const text of ['0 0 21 21', '0,0,24,24', ' -1 -1 2 2 ', '0 0 0 10', '0 0 10', 'a b c d'])
			expect(engine.viewBox(text)).toBe(
				((values) => (values && values.length === 4 && values[2]! > 0 && values[3]! > 0 ? values.join(' ') : null))(
					parseNumberList(text),
				),
			);
	});
});
