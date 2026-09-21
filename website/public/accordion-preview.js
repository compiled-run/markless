const frame = window.frameElement;
const content = document.querySelector('[data-standalone-example]');

if (frame?.hasAttribute('data-accordion-preview') && content) {
 const fit = () => { frame.style.height = Math.ceil(content.getBoundingClientRect().height) + 'px'; };
 const observer = new ResizeObserver(fit);
 observer.observe(content);
 fit();
 window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
