export function Player({ currentSong, isPlaying, onPlayToggle, onPrevious, onNext }) @{
	<div class="player">
		<div class="time-control">
			<p class="time-current">0:00</p>
			<div
				class="track"
				data-color-start={currentSong.color[0]}
				data-color-end={currentSong.color[1]}
			>
				<input class="progress-input" min="0" max="0" value="0" type="range" />
				<div class="animate-track"></div>
			</div>
			<p class="time-duration">0:00</p>
		</div>
		<div class="play-control">
			<button type="button" class="skip-back" aria-label="Previous track" onClick={onPrevious}>‹</button>
			<button
				type="button"
				class={isPlaying ? 'play active' : 'play'}
				aria-label="Play or pause"
				onClick={onPlayToggle}
			>
				@if (isPlaying) {
					<span class="play-icon">❚❚</span>
				} @else {
					<span class="play-icon">▶</span>
				}
			</button>
			<button type="button" class="skip-forward" aria-label="Next track" onClick={onNext}>›</button>
		</div>
	</div>
}
