import { render } from '@markless/core';
import { Count } from './count.tsrx';
import { Hand } from './hand.tsrx';

for (const target of document.querySelectorAll<HTMLElement>('[data-hand]')) await render(Hand, { target });
for (const target of document.querySelectorAll<HTMLElement>('[data-count]')) await render(Count, { target });
