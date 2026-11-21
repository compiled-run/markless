import { describe, expect, it } from 'vitest';
import { fontFaceSources } from '../src/native.ts';

describe('fontFaceSources', () => {
	it("reads each @font-face src url() as the CSS parser decodes it, nested in conditional rules, in any case, once each", () => {
		const css = `@font-face { font-family: 'A'; src: url('./fonts/A.ttf') format('truetype'), url(a.woff2), local(A); }
@media (min-width: 1px) { @FONT-FACE { SRC: url("./fonts/B\\2e otf") } }
@font-face { src: url('./fonts/A.ttf'); }
.x { background: url(./bg.png); }
/* @font-face { src: url(./commented.ttf) } */`;
		expect(fontFaceSources(css)).toEqual(['./fonts/A.ttf', 'a.woff2', './fonts/B.otf']);
	});

	it('names nothing for a sheet without @font-face', () => {
		expect(fontFaceSources('body { font-family: serif; background: url(./bg.png) }')).toEqual([]);
	});
});
