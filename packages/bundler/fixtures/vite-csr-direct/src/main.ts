import { render } from '@markless/core';
import { Board } from './board.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('Expected #app target.');

await render(Board, { target });
