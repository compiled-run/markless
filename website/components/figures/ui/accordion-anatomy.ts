// The accordion's one idea in ink: press the heading and its panel opens; the panel's aria-labelledby points back at that heading.
import { roundRect } from '../ink/desk.ts';
import { pathOf } from '../ink/ink.ts';
import { sketcher } from '../reading/sketch.ts';

export function drawing() {
	const s = sketcher(560, 200, [], 15);
	const x0 = 40;
	const x1 = 380;
	const top = 12;
	const head = 46;
	const bottom = top + head + 110;

	s.shape(pathOf(roundRect(x0, top, x1, top + head, 8), true), 'box head');
	s.shape(pathOf(roundRect(x0 + 3, top + 4, x1 - 3, top + head - 4, 8), true), 'wash head');
	s.pen([...roundRect(x0, top, x1, top + head, 8), [x0 + 8, top]], 0, 'pen head');
	s.pen([[x0 + 18, top + 18], [x0 + 26, top + 26], [x0 + 18, top + 34]], 0, 'pen head closed-mark');
	s.pen([[x0 + 14, top + 20], [x0 + 22, top + 28], [x0 + 30, top + 20]], 0, 'pen head open-mark');
	s.text(x0 + 44, top + 29, 'Do you ship overseas?', 'ui head');

	s.shape(pathOf(roundRect(x0, top + head + 6, x1, bottom, 8), true), 'box panel');
	s.pen([...roundRect(x0, top + head + 6, x1, bottom, 8), [x0 + 8, top + head + 6]], 150, 'pen panel');
	for (const [i, end] of [300, 250, 190].entries()) {
		const y = top + head + 38 + i * 24;
		s.pen([[x0 + 22, y], [x0 + end * 0.5, y + 1.5], [x0 + end, y - 1]], 450 + i * 120, 'pen panel scribble');
	}

	s.arrow([x1 + 10, top + head + 60], [x1 + 14, top + head / 2], 900, 'pen panel names', [[36, -10], [36, 10]]);
	s.text(x1 + 50, top + head + 30, 'aria-labelledby', 'code-label panel');
	return s.out;
}
