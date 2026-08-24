/**
 * The family ships no CSS, so every scenario needs the layout a carousel needs:
 * a window that clips, a track that lays the slides out in a line, and slides
 * with a size the engine can measure. The transition is short so a test does not
 * wait on an animation designed for a person.
 *
 * The scenarios used to carry this in a `<style>` element of their own. That
 * element never reached the page - markup `<style>` is dropped, so every
 * carousel row was running against an unstyled document - which is what hid
 * defect 82: an unstyled vertical viewport is auto-height, so it measures its
 * own content and reports every slide as visible. Until markup `<style>` lands,
 * the sheet is installed straight into the document by the suite.
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

const STYLE_ID = 'carousel-scenario-css';

/**
 * Puts the scenario layout on the document, once. Idempotent and re-checked on
 * every call, so a harness that rebuilds the document between rows still gets a
 * laid-out carousel rather than a bare stack of divs.
 */
export function installCarouselCss(): void {
	const existing = document.getElementById(STYLE_ID);
	if (existing?.isConnected) return;

	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = CAROUSEL_CSS;
	document.head.append(style);
}
