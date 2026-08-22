import { render } from '@markless/core';
import { Gallery } from './Gallery.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('The screen reader gallery needs a #app element to mount into.');

await render(Gallery, { target });

// The page is only worth reading once the families are in the DOM. A driver
// waits on this instead of on a timer, so a slow runner does not turn into a
// reader that walks an empty document and reports a missing announcement.
document.documentElement.dataset.galleryReady = 'true';
