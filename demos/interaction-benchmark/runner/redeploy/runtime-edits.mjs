// e5: one string literal in each framework's shipped client runtime, patched in every build variant of
// the package that carries it (as a patch release would). `workspace` dirs are relative to the repo
// root (Markless ships from workspace packages); the rest are relative to the app directory.
export const runtimeEdits = {
	markless: {
		workspace: true,
		dir: 'packages/runtime/src',
		from: 'Cannot delete a graph node root.',
		to: 'Cannot delete the root of a graph node.',
	},
	qwik: {
		dir: 'node_modules/@qwik.dev/core/dist',
		from: 'Error during computation',
		to: 'Error while computing',
	},
	octane: {
		dir: 'node_modules/octane/dist',
		from: 'Unreachable hook path',
		to: 'Unreachable hook slot path',
	},
	'react-router': {
		dir: 'node_modules/react-router/dist',
		from: 'No lazy route function found',
		to: 'No lazy route function was found',
	},
	remix3: {
		dir: 'node_modules/.pnpm/@remix-run+ui@0.10.0/node_modules/@remix-run/ui/dist',
		from: 'Parent node not found',
		to: 'Parent node was not found',
	},
	solidstart: {
		dir: 'node_modules/solid-js/dist',
		from: 'Hydration value was truncated',
		to: 'Hydration value got truncated',
	},
	sveltekit: {
		dir: 'node_modules/svelte/src/internal/client',
		from: 'Failed to hydrate: ',
		to: 'Hydration failed: ',
	},
	ripple: {
		dir: 'node_modules/ripple/src/runtime/internal/client',
		from: 'An error occurred during server rendering',
		to: 'An error happened during server rendering',
	},
};
runtimeEdits['qwik-tuned'] = runtimeEdits.qwik;
