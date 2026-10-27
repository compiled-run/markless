import { markless } from '@markless/core/vite';
import { ui } from '@markless/ui/vite';
import { codeClient } from './tooling/code-client.ts';

// Only the plugins the tests import through: router() brings Nitro, whose `unwasm` condition hands shiki a raw onig.wasm.
export default {
	root: import.meta.dirname,
	plugins: [ui(), codeClient(), markless()],
	test: { name: 'website' },
};
