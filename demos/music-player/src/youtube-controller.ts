import type {
	YouTubeApi,
	YouTubePlayer,
	installYouTubeControllerRuntime,
} from './youtube-controller-runtime';

declare global {
	interface Window {
		YT?: YouTubeApi;
		onYouTubeIframeAPIReady?: () => void;
	}
}

const youtubeApiSrc = 'https://www.youtube.com/iframe_api';
let youtubeApiPromise: Promise<YouTubeApi> | undefined;

export function installYouTubeController(root: ParentNode): void {
	const host = root.querySelector<HTMLElement>('.youtube-frame-host');
	const target = root.querySelector<HTMLElement>('.youtube-player-target');
	if (!host || !target) return;
	void loadYouTubeApi().then((api) => installCueTier(root, host, target, api));
}

function installCueTier(
	root: ParentNode,
	host: HTMLElement,
	target: HTMLElement,
	api: YouTubeApi,
): void {
	let ready = false;
	let runtime: ReturnType<typeof installYouTubeControllerRuntime>;
	let loading: Promise<void> | undefined;
	const demandRuntime = (player: YouTubePlayer) =>
		(loading ??= import('./youtube-controller-runtime').then((module) => {
			runtime = module.installYouTubeControllerRuntime(root, api, { player, ready });
			observer.disconnect();
		}));
	const player = new api.Player(target, {
		height: '100%',
		width: '100%',
		videoId: host.dataset.videoId || '',
		playerVars: {
			controls: 1,
			modestbranding: 1,
			origin: window.location.origin,
			playsinline: 1,
			rel: 0,
		},
		events: {
			onReady: () => {
				ready = true;
				player.cueVideoById(host.dataset.videoId || '');
				runtime?.markReady();
			},
			onStateChange: (event) => runtime?.handleStateChange(event.data),
		},
	});
	const observer = new MutationObserver(() => {
		if ((host.dataset.command || 'cue') !== 'cue') void demandRuntime(player);
	});
	observer.observe(host, { attributeFilter: ['data-command', 'data-command-version'] });
}

function loadYouTubeApi(): Promise<YouTubeApi> {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	if (youtubeApiPromise) return youtubeApiPromise;

	youtubeApiPromise = new Promise((resolve) => {
		const previousReadyHandler = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previousReadyHandler?.();
			if (window.YT) resolve(window.YT);
		};
		if (!document.querySelector(`script[src="${youtubeApiSrc}"]`)) {
			const script = document.createElement('script');
			script.src = youtubeApiSrc;
			document.body.appendChild(script);
		}
	});
	return youtubeApiPromise;
}
