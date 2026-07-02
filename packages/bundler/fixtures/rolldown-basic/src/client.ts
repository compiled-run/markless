import App from './root.tsrx';

globalThis.dispatchEvent(new CustomEvent('markless:fixture', { detail: App.source }));
