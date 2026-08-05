type YouTubeCommand = 'cue' | 'load' | 'pause' | 'play' | 'seek';

export type YouTubeApi = {
	readonly Player: new (
		element: Element,
		options: {
			height: string;
			width: string;
			videoId: string;
			playerVars: Record<string, unknown>;
			events: {
				onReady: () => void;
				onStateChange: (event: { data: number }) => void;
			};
		},
	) => YouTubePlayer;
	readonly PlayerState: {
		readonly CUED: number;
		readonly ENDED: number;
		readonly PAUSED: number;
		readonly PLAYING: number;
	};
};

export type YouTubePlayer = {
	cueVideoById(videoId: string): void;
	destroy(): void;
	getCurrentTime(): number;
	getDuration(): number;
	loadVideoById(videoId: string): void;
	pauseVideo(): void;
	playVideo(): void;
	seekTo(time: number, allowSeekAhead: boolean): void;
};

export function installYouTubeControllerRuntime(
	root: ParentNode,
	api: YouTubeApi,
	initial?: { readonly player: YouTubePlayer; readonly ready: boolean },
): YouTubeController | undefined {
	const host = root.querySelector<HTMLElement>('.youtube-frame-host');
	const target = root.querySelector<HTMLElement>('.youtube-player-target');
	if (!host || !target) return undefined;

	const controller = new YouTubeController(root, host, target, api, initial);
	controller.install();
	return controller;
}

class YouTubeController {
	private duration = 0;
	private infoTime = 0;
	private infoDuration = 0;
	private lastCommandVersion = '';
	private lastVideoId = '';
	private pendingAutoplay = false;
	private player: YouTubePlayer | undefined;
	private progressTimer = 0;
	private ready = false;
	private state: YouTubeApi['PlayerState'] | undefined;

	constructor(
		private readonly root: ParentNode,
		private readonly host: HTMLElement,
		private readonly target: HTMLElement,
		private readonly api: YouTubeApi,
		initial?: { readonly player: YouTubePlayer; readonly ready: boolean },
	) {
		this.player = initial?.player;
		this.ready = initial?.ready ?? false;
	}

	install(): void {
		this.listenForPlayerInfo();
		this.bindProgressInput();
		this.observeCommands();
		this.observeTrackColors();
		this.applyTrackColors();
		if (this.player) {
			this.state = this.api.PlayerState;
			if (this.ready) this.applyCommand(true);
		} else this.createPlayer();
	}

	private createPlayer(): void {
		const api = this.api;
		this.state = api.PlayerState;

		this.player = new api.Player(this.target, {
			height: '100%',
			width: '100%',
			videoId: this.videoId,
			playerVars: {
				controls: 1,
				modestbranding: 1,
				origin: window.location.origin,
				playsinline: 1,
				rel: 0,
			},
			events: {
				onReady: () => {
					this.ready = true;
					this.applyCommand(true);
				},
				onStateChange: (event) => this.handleStateChange(event.data),
			},
		});
	}

	private observeCommands(): void {
		const observer = new MutationObserver(() => this.applyCommand(false));
		observer.observe(this.host, {
			attributeFilter: [
				'data-command',
				'data-command-version',
				'data-playing',
				'data-video-id',
			],
		});
	}

	private observeTrackColors(): void {
		const track = this.track;
		if (!track) return;

		const observer = new MutationObserver(() => this.applyTrackColors());
		observer.observe(track, {
			attributeFilter: ['data-color-start', 'data-color-end'],
		});
	}

	private bindProgressInput(): void {
		const input = this.progressInput;
		input?.addEventListener('input', () => {
			const nextTime = Number(input.value);
			if (!Number.isFinite(nextTime)) return;
			this.player?.seekTo(nextTime, true);
			this.writeProgress(nextTime, this.duration);
		});
	}

	private applyCommand(force: boolean): void {
		if (!this.ready || !this.player) return;

		const videoChanged = this.videoId !== this.lastVideoId;
		const commandChanged = this.commandVersion !== this.lastCommandVersion;
		if (!force && !videoChanged && !commandChanged) return;

		this.lastVideoId = this.videoId;
		this.lastCommandVersion = this.commandVersion;

		if (!this.videoId) return;

		if (this.command === 'pause') {
			this.pendingAutoplay = false;
			this.player.pauseVideo();
			this.stopProgressTimer();
			this.reportProgress();
			return;
		}

		if (this.command === 'play') {
			this.pendingAutoplay = true;
			this.player.playVideo();
			this.startProgressTimer();
			return;
		}

		if (this.command === 'load' || (videoChanged && this.shouldPlay)) {
			this.pendingAutoplay = true;
			this.resetProgress();
			this.player.loadVideoById(this.videoId);
			window.setTimeout(() => {
				if (this.pendingAutoplay) this.player?.playVideo();
			}, 0);
			return;
		}

		if (this.command === 'seek') return;

		this.pendingAutoplay = false;
		this.resetProgress();
		this.player.cueVideoById(this.videoId);
		this.stopProgressTimer();
	}

	handleStateChange(nextState: number): void {
		if (!this.state) return;

		if (nextState === this.state.PLAYING) {
			this.pendingAutoplay = false;
			this.root.querySelector<HTMLButtonElement>('.youtube-sync-playing')?.click();
			this.startProgressTimer();
			return;
		}

		if (nextState === this.state.PAUSED) {
			if (this.pendingAutoplay) {
				this.player?.playVideo();
				return;
			}

			this.root.querySelector<HTMLButtonElement>('.youtube-sync-paused')?.click();
			this.stopProgressTimer();
			this.reportProgress();
			return;
		}

		if (nextState === this.state.CUED) {
			if (this.pendingAutoplay) this.player?.playVideo();
			this.reportProgress();
			return;
		}

		if (nextState === this.state.ENDED) {
			this.pendingAutoplay = false;
			this.stopProgressTimer();
			this.root.querySelector<HTMLButtonElement>('.skip-forward')?.click();
		}
	}

	markReady(): void {
		this.ready = true;
		this.applyCommand(true);
	}

	private startProgressTimer(): void {
		if (this.progressTimer) return;
		this.reportProgress();
		this.progressTimer = window.setInterval(() => this.reportProgress(), 250);
	}

	private stopProgressTimer(): void {
		if (!this.progressTimer) return;
		window.clearInterval(this.progressTimer);
		this.progressTimer = 0;
	}

	private resetProgress(): void {
		this.duration = 0;
		this.infoTime = 0;
		this.infoDuration = 0;
		this.writeProgress(0, 0);
	}

	// The widget's own status stream is authoritative; the api handle's cache can go stale.
	private listenForPlayerInfo(): void {
		window.addEventListener('message', (event) => {
			if (typeof event.data !== 'string') return;
			try {
				const message = JSON.parse(event.data);
				if (message?.event !== 'infoDelivery' || !message.info) return;
				if (typeof message.info.currentTime === 'number') this.infoTime = message.info.currentTime;
				if (typeof message.info.duration === 'number' && message.info.duration > 0)
					this.infoDuration = message.info.duration;
			} catch {
				/* non-widget message */
			}
		});
	}

	private reportProgress(): void {
		if (!this.ready || !this.player) return;

		const currentTime = this.infoTime || this.player.getCurrentTime() || 0;
		const duration = this.infoDuration || this.player.getDuration() || 0;
		this.duration = duration;
		this.writeProgress(currentTime, duration);
	}

	private applyTrackColors(): void {
		const track = this.track;
		if (!track) return;

		const colorStart = track.dataset.colorStart || '#2f4f66';
		const colorEnd = track.dataset.colorEnd || '#a57c5b';
		track.style.background = `linear-gradient(to right, ${colorStart}, ${colorEnd})`;
	}

	private writeProgress(currentTime: number, duration: number): void {
		const safeDuration = Math.max(0, duration);
		const safeCurrent = Math.min(Math.max(0, currentTime), safeDuration || currentTime);
		const input = this.progressInput;
		const current = this.root.querySelector<HTMLElement>('.time-current');
		const total = this.root.querySelector<HTMLElement>('.time-duration');
		const track = this.root.querySelector<HTMLElement>('.animate-track');
		const percentage = safeDuration ? (safeCurrent / safeDuration) * 100 : 0;

		if (input) {
			input.max = String(safeDuration || 0);
			input.value = String(safeCurrent || 0);
		}
		if (current) current.textContent = formatTime(safeCurrent);
		if (total) total.textContent = safeDuration ? formatTime(safeDuration) : '0:00';
		if (track) track.style.transform = `translateX(${percentage}%)`;
	}

	private get command(): YouTubeCommand {
		return (this.host.dataset.command || 'cue') as YouTubeCommand;
	}

	private get commandVersion(): string {
		return this.host.dataset.commandVersion || '';
	}

	private get progressInput(): HTMLInputElement | null {
		return this.root.querySelector<HTMLInputElement>('.progress-input');
	}

	private get shouldPlay(): boolean {
		return this.host.dataset.playing === 'true';
	}

	private get track(): HTMLElement | null {
		return this.root.querySelector<HTMLElement>('.track');
	}

	private get videoId(): string {
		return this.host.dataset.videoId || '';
	}
}

function formatTime(time: number): string {
	const minutes = Math.floor(time / 60);
	const seconds = String(Math.floor(time % 60)).padStart(2, '0');
	return `${minutes}:${seconds}`;
}
