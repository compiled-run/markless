import { render } from '@markless/core';
import App from './App.tsrx';
import './styles.css';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for the live-feed CSR render.');
}

const measurementGlobal = globalThis as typeof globalThis & {
	readonly __marklessMeasureSettleArrival?: () => Promise<void>;
};
await render(App, {
	target: app,
	async beforeMount() {
		await measurementGlobal.__marklessMeasureSettleArrival?.();
		// Emit after record registration, before the boundary self-wake can schedule.
		app.setAttribute('data-feed-settle-arrived', '');
	},
});
