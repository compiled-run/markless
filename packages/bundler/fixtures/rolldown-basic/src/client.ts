import App from './root.tsrx';

globalThis.dispatchEvent(new CustomEvent('arcade:fixture', { detail: App.source }));
