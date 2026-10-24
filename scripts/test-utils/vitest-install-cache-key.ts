import type { Plugin } from 'vite-plus';

// Vitest keys its on-disk module cache by version, not install, so two installs share entries.
export function vitestInstallCacheKey(): Plugin {
	return {
		name: 'markless-test:vitest-install-cache-key',
		configureVitest({ vitest, defineCacheKeyGenerator }) {
			defineCacheKeyGenerator(() => vitest.distPath);
		},
	};
}
