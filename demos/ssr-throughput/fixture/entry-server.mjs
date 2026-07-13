import { renderToString } from '@markless/web';
import { ESCAPE_SENTINEL } from './data.mjs';
import EscapeHeavy from './escape.tsrx';
import News50 from './news-50.tsrx';
import News500 from './news-500.tsrx';
import ParallelAsync from './parallel.tsrx';
import NestedWaterfall from './waterfall.tsrx';

const render = (artifact) => renderToString(artifact, { executionLog: 'never' });

export { ESCAPE_SENTINEL };
export const renderNews50 = () => render(News50);
export const renderNews500 = () => render(News500);
export const renderParallelAsync = () => render(ParallelAsync);
export const renderNestedWaterfall = () => render(NestedWaterfall);
export const renderEscapeHeavy = () => render(EscapeHeavy);
