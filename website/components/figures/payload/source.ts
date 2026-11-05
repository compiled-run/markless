// The payload figure's View Source as plain keyed data: one row per line, one span per coloured token.
import { SOURCE } from './model.ts';

export function drawing() {
	return {
		lines: SOURCE.map((line) => ({ key: line.key, part: line.part, hang: '--in:' + /^ */.exec(line.tokens.map((token) => token.t).join(''))![0].length + 'ch', tokens: line.tokens.map((token, i) => ({ key: line.key + '-' + i, c: token.c, t: token.t, w: token.w ?? '' })) })),
	};
}
