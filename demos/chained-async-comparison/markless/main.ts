declare global {
	interface Window {
		__ready: boolean;
	}
}

window.__ready = true;
