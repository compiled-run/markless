// The static markup that lays the torn-strip frame round a plain code block; its look lives in global.css.

/** Empty pieces the frame paints with CSS masks; the code block itself stays the only readable content. */
export const TORN_STRIP_ART =
	'<span class="torn-art" aria-hidden="true">' +
	'<span class="torn-cast"><span class="torn-below"></span><span class="torn-beside"></span><span class="torn-corner"></span></span>' +
	'<span class="torn-middle"></span><span class="torn-band torn-upper"></span><span class="torn-band torn-lower"></span>' +
	'<span class="torn-ends"></span>' +
	'</span>';

const PRE = /<pre[\s>][\s\S]*?<\/pre>/g;

/** Wraps every `<pre>` block in one chunk of static HTML in the torn-strip frame. */
export function frameCodeBlocks(html: string): string {
	return html.replace(PRE, (pre) => `<div class="torn-strip">${TORN_STRIP_ART}${pre}</div>`);
}
