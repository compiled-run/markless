import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { ui } from '@markless/ui/vite';

export default {
	// A page fetched early keeps the storage() values it was rendered with, so a list shown after a delete would be stale.
	plugins: [ui(), markless(), router({ prefetch: false })],
};
