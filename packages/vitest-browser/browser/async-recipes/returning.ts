export function onReturn(wake: () => void) {
	const stop = new AbortController();
	const options = { signal: stop.signal };
	const visible = () => {
		if (!document.hidden) wake();
	};
	document.addEventListener(
		'visibilitychange',
		visible,
		options,
	);
	addEventListener('online', wake, options);
	return () => stop.abort();
}
