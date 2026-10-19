import { renderToString, type RenderToStringOptions } from '@markless/core';
import Keyed from './keyed.tsrx';
import Slots8 from './slots-8.tsrx';
import Slots16 from './slots-16.tsrx';

export const pages = { Keyed, Slots8, Slots16 };

export function render(page: keyof typeof pages, options?: RenderToStringOptions) {
	return renderToString(pages[page], options);
}
