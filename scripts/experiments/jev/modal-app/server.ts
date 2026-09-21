import { renderToString } from '../../../../packages/core/src/index.ts';
import Nested from '../../../../packages/headless/components/src/modal/scenarios/nested.tsrx';

export default Nested;
export function render(options: Parameters<typeof renderToString>[1]) {
  return renderToString(Nested, options);
}
