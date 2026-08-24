/**
 * The family ships no CSS, so every scenario writes the layout a carousel needs:
 * a window that clips, a track that lays the slides out in a line, and slides
 * with a size the engine can measure. The transition is short so a test does not
 * wait on an animation designed for a person.
 */
export const CAROUSEL_CSS = `
	[data-viewport] { width: 300px; height: 100px; overflow: hidden; }
	[data-viewport][ui-vertical] { width: 100px; height: 300px; }
	[ui-track] { display: flex; flex-direction: row; transition: transform 60ms linear; }
	[ui-track][ui-vertical] { flex-direction: column; height: 100%; }
	[data-rows] { display: contents; }
	[data-slide] { flex: 0 0 300px; width: 300px; height: 100px; }
	[ui-vertical] > [data-slide] { flex: 0 0 300px; width: 100px; height: 300px; }
`;
