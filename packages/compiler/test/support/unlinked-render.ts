/** A component that renders one imported from a file the compile is given no interface for, so the page cannot be re-rendered from this compile alone. */
export const UNLINKED_RENDER = `
import { Badge } from './unlinked-badge.tsrx';

export function Elsewhere() @{
	<Badge />
}
`;
