import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
} from './index.ts';

export function createDevErrorClientAsset(viteClientUrl: string): string {
	const viteClientSuffix = '/@vite/client';
	const base = viteClientUrl.endsWith(viteClientSuffix)
		? viteClientUrl.slice(0, -viteClientSuffix.length)
		: '';
	return `import { createHotContext } from ${JSON.stringify(viteClientUrl)};
const hot = createHotContext(${JSON.stringify(MARKLESS_DEV_ERROR_CLIENT_ID)});
const ERROR_EVENT = ${JSON.stringify(MARKLESS_DEV_ERROR_EVENT)};
const CLEAR_EVENT = ${JSON.stringify(MARKLESS_DEV_ERROR_CLEAR_EVENT)};
const ELEMENT = 'markless-dev-error-overlay';
const SUPPRESSION = 'data-markless-vite-overlay-suppression';
const OPEN_IN_EDITOR = ${JSON.stringify(`${base}/__open-in-editor`)};
let currentPayload;
let observer;

const styles = ${JSON.stringify(`
:host{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:clamp(1rem,4vw,3rem);background:#0008;color:CanvasText;font-family:system-ui,sans-serif}
*{box-sizing:border-box}.panel{width:min(60rem,100%);max-height:calc(100vh - 2rem);overflow:auto;padding:clamp(1.25rem,3vw,2.5rem);border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-top:4px solid #c9362b;border-radius:.5rem;background:Canvas;box-shadow:0 1rem 3rem #0006}
header{display:flex;flex-direction:column;gap:.6rem}.badge{align-self:flex-start;padding:.15rem .45rem;border-radius:.25rem;background:color-mix(in srgb,#c9362b 14%,Canvas);color:#c9362b;font:600 .75rem ui-monospace,monospace}h1{margin:0;font-size:clamp(1.4rem,3vw,2rem);line-height:1.2}h2{margin:1rem 0 .25rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:color-mix(in srgb,CanvasText 65%,transparent)}p{margin:.3rem 0 1rem;line-height:1.55}a{color:LinkText}.location{display:inline-block;margin-top:1rem;font:500 .9rem ui-monospace,monospace}.frame,details pre{overflow:auto;padding:1rem;border-radius:.35rem;background:color-mix(in srgb,CanvasText 7%,Canvas);font:.85rem/1.55 ui-monospace,monospace;white-space:pre}details{margin-top:1rem;border-top:1px solid color-mix(in srgb,CanvasText 15%,transparent);padding-top:1rem}summary{cursor:pointer;font-weight:600}.recovery{margin:1.5rem 0 0;color:color-mix(in srgb,CanvasText 65%,transparent);font-size:.9rem}`)};

function append(parent, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}
function diagnosticBody(parent, diagnostic) {
  if (diagnostic.filename && diagnostic.line != null && diagnostic.column != null) {
    const link = append(parent, 'a', diagnostic.filename + ':' + diagnostic.line + ':' + diagnostic.column, 'location');
    link.href = new URL(OPEN_IN_EDITOR + '?file=' + encodeURIComponent(diagnostic.filename), document.baseURI).href;
  }
  if (diagnostic.why) { const section = append(parent, 'section'); append(section, 'h2', 'Why'); append(section, 'p', diagnostic.why); }
  if (diagnostic.suggestion) { const section = append(parent, 'section'); append(section, 'h2', 'Suggested fix'); append(section, 'p', diagnostic.suggestion); }
  if (diagnostic.frame) append(parent, 'pre', diagnostic.frame, 'frame');
  if (diagnostic.docsUrl) { const paragraph = append(parent, 'p'); const link = append(paragraph, 'a', 'Read ' + diagnostic.code + ' documentation'); link.href = diagnostic.docsUrl; }
}
class MarklessDevErrorOverlay extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = append(shadow, 'style'); style.textContent = styles;
    const panel = append(shadow, 'article', undefined, 'panel');
    panel.addEventListener('click', (event) => event.stopPropagation());
    this.addEventListener('click', () => this.remove());
  }
  show(payload) {
    const panel = this.shadowRoot.querySelector('.panel');
    panel.replaceChildren();
    const primary = payload.diagnostics[0] || { code: 'MARKLESS_DEV_RUNTIME_ERROR', message: payload.details };
    const header = append(panel, 'header'); append(header, 'span', primary.code, 'badge'); append(header, 'h1', primary.message);
    diagnosticBody(panel, primary);
    for (const diagnostic of payload.diagnostics.slice(1)) {
      const details = append(panel, 'details'); append(details, 'summary', diagnostic.code + ' — ' + diagnostic.message); diagnosticBody(details, diagnostic);
    }
    const technical = append(panel, 'details'); append(technical, 'summary', 'Technical details'); append(technical, 'pre', [payload.details, payload.stack].filter(Boolean).join('\\n\\n'));
    append(panel, 'p', 'Fixing the error clears this overlay. Press Escape or click the backdrop to dismiss it temporarily.', 'recovery');
  }
}
if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, MarklessDevErrorOverlay);
function removeViteOverlays() { document.querySelectorAll('vite-error-overlay').forEach((node) => node.remove()); }
function suppressViteOverlay() {
  removeViteOverlays();
  if (!document.head.querySelector('style[' + SUPPRESSION + ']')) { const style = append(document.head, 'style'); style.setAttribute(SUPPRESSION, ''); style.textContent = 'vite-error-overlay{display:none!important}'; }
  if (!observer) { observer = new MutationObserver(removeViteOverlays); observer.observe(document.documentElement, { childList: true, subtree: true }); }
}
function reset() {
  removeViteOverlays(); document.querySelector(ELEMENT)?.remove(); document.head.querySelector('style[' + SUPPRESSION + ']')?.remove(); observer?.disconnect(); observer = undefined; currentPayload = undefined;
}
function show(payload) {
  currentPayload = payload; suppressViteOverlay(); document.querySelector(ELEMENT)?.remove(); const overlay = document.createElement(ELEMENT); overlay.show(payload); document.body.append(overlay);
}
hot.on(ERROR_EVENT, show);
hot.on(CLEAR_EVENT, ({ id }) => { if (currentPayload?.id === id) reset(); });
hot.on('vite:beforeFullReload', reset);
addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelector(ELEMENT)?.remove(); });
if (window.__MARKLESS_DEV_ERROR__) show(window.__MARKLESS_DEV_ERROR__);
`;
}
