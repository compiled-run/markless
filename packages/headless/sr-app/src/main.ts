import { render, type Component, type RenderTarget } from '@markless/core';
import { Gallery } from './Gallery.tsrx';

const target = document.querySelector<HTMLElement>('#app');
if (!target) throw new Error('The screen reader gallery needs a #app element to mount into.');

// The type service sees source-level types; the bundler hands render the compiled
// artifact, and a DOM element satisfies RenderTarget's structural contract at runtime.
await render(Gallery as unknown as Component, { target: target as RenderTarget });

// The page is only worth reading once the families are in the DOM. A driver
// waits on this instead of on a timer, so a slow runner does not turn into a
// reader that walks an empty document and reports a missing announcement.
document.documentElement.dataset.galleryReady = 'true';
