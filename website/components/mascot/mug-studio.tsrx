import MugArt, { FacePreview } from './mug-art.tsrx';
import { state, storage, computed, element } from '@markless/core';

export default function MugStudio() @{
	let mood = state('idle');
	let action = state('');
	let face = storage('mascot-expression', 'neutral');
	let interacted = state(false);
	let glaze = storage('mascot-glaze', 'cream');
	let pour = storage('mascot-pour', 'rosetta');
	let coaster = storage('mascot-coaster', 'off');
	let companion = storage('mascot-companion', 'off');
	let playing = state(false);
	let paused = state(false);
	let run = state(0);
	let glazeCreamSelected = element<HTMLButtonElement>();
	let glazeCreamUnselected = element<HTMLButtonElement>();
	let glazeYellowSelected = element<HTMLButtonElement>();
	let glazeYellowUnselected = element<HTMLButtonElement>();
	let glazePinkSelected = element<HTMLButtonElement>();
	let glazePinkUnselected = element<HTMLButtonElement>();
	let glazePurpleSelected = element<HTMLButtonElement>();
	let glazePurpleUnselected = element<HTMLButtonElement>();
	let glazeGreenSelected = element<HTMLButtonElement>();
	let glazeGreenUnselected = element<HTMLButtonElement>();
	let glazeInkSelected = element<HTMLButtonElement>();
	let glazeInkUnselected = element<HTMLButtonElement>();
	let glazePaperSelected = element<HTMLButtonElement>();
	let glazePaperUnselected = element<HTMLButtonElement>();
	let pourRosettaSelected = element<HTMLButtonElement>();
	let pourRosettaUnselected = element<HTMLButtonElement>();
	let pourHeartSelected = element<HTMLButtonElement>();
	let pourHeartUnselected = element<HTMLButtonElement>();
	let pourTulipSelected = element<HTMLButtonElement>();
	let pourTulipUnselected = element<HTMLButtonElement>();
	let pourMarklessSelected = element<HTMLButtonElement>();
	let pourMarklessUnselected = element<HTMLButtonElement>();
	let expressionNeutralSelected = element<HTMLButtonElement>();
	let expressionNeutralUnselected = element<HTMLButtonElement>();
	let expressionAttentiveSelected = element<HTMLButtonElement>();
	let expressionAttentiveUnselected = element<HTMLButtonElement>();
	let expressionSurprisedSelected = element<HTMLButtonElement>();
	let expressionSurprisedUnselected = element<HTMLButtonElement>();
	let expressionExcitedSelected = element<HTMLButtonElement>();
	let expressionExcitedUnselected = element<HTMLButtonElement>();
	let expressionHappySelected = element<HTMLButtonElement>();
	let expressionHappyUnselected = element<HTMLButtonElement>();
	let expressionLaughingSelected = element<HTMLButtonElement>();
	let expressionLaughingUnselected = element<HTMLButtonElement>();
	let expressionAngrySelected = element<HTMLButtonElement>();
	let expressionAngryUnselected = element<HTMLButtonElement>();
	let expressionSadSelected = element<HTMLButtonElement>();
	let expressionSadUnselected = element<HTMLButtonElement>();
	let expressionScaredSelected = element<HTMLButtonElement>();
	let expressionScaredUnselected = element<HTMLButtonElement>();
	let expressionSuspiciousSelected = element<HTMLButtonElement>();
	let expressionSuspiciousUnselected = element<HTMLButtonElement>();
	let expressionConfusedSelected = element<HTMLButtonElement>();
	let expressionConfusedUnselected = element<HTMLButtonElement>();
	let expressionCuriousSelected = element<HTMLButtonElement>();
	let expressionCuriousUnselected = element<HTMLButtonElement>();
	let expressionProudSelected = element<HTMLButtonElement>();
	let expressionProudUnselected = element<HTMLButtonElement>();
	let expressionShySelected = element<HTMLButtonElement>();
	let expressionShyUnselected = element<HTMLButtonElement>();
	let expressionUnimpressedSelected = element<HTMLButtonElement>();
	let expressionUnimpressedUnselected = element<HTMLButtonElement>();
	let expressionSleepySelected = element<HTMLButtonElement>();
	let expressionSleepyUnselected = element<HTMLButtonElement>();
	let coasterOffSelected = element<HTMLButtonElement>();
	let coasterOffUnselected = element<HTMLButtonElement>();
	let coasterCorkSelected = element<HTMLButtonElement>();
	let coasterCorkUnselected = element<HTMLButtonElement>();
	let companionOffSelected = element<HTMLButtonElement>();
	let companionOffUnselected = element<HTMLButtonElement>();
	let companionBeansSelected = element<HTMLButtonElement>();
	let companionBeansUnselected = element<HTMLButtonElement>();
	let companionSugarSelected = element<HTMLButtonElement>();
	let companionSugarUnselected = element<HTMLButtonElement>();
	let companionCraneSelected = element<HTMLButtonElement>();
	let companionCraneUnselected = element<HTMLButtonElement>();
	let companionEucalyptusSelected = element<HTMLButtonElement>();
	let companionEucalyptusUnselected = element<HTMLButtonElement>();
	let companionNotesSelected = element<HTMLButtonElement>();
	let companionNotesUnselected = element<HTMLButtonElement>();
	let companionMokaSelected = element<HTMLButtonElement>();
	let companionMokaUnselected = element<HTMLButtonElement>();
	let validFace = computed(() =>
		[
			'neutral',
			'attentive',
			'surprised',
			'excited',
			'happy',
			'laughing',
			'angry',
			'sad',
			'scared',
			'suspicious',
			'confused',
			'curious',
			'proud',
			'shy',
			'unimpressed',
			'sleepy',
		].includes(face)
			? face
			: 'neutral',
	);
	let validGlaze = computed(() =>
		['cream', 'yellow', 'pink', 'purple', 'green', 'ink', 'paper'].includes(glaze)
			? glaze
			: 'cream',
	);
	let validPour = computed(() =>
		['rosetta', 'heart', 'tulip', 'markless'].includes(pour) ? pour : 'rosetta',
	);
	let validCoaster = computed(() => (['off', 'cork'].includes(coaster) ? coaster : 'off'));
	let validCompanion = computed(() =>
		['off', 'beans', 'sugar', 'crane', 'eucalyptus', 'notes', 'moka'].includes(companion)
			? companion
			: 'off',
	);

	<div class="mascot">
		<p class="saved-note">
			Your choices are saved in this browser and follow you through the docs.
		</p>
		<div class="studio">
			<section class="stage" aria-label="Mug preview">
				<div class="stage-top">
					<span class="eyebrow">A little daily companion</span>
					<button
						class="pause"
						type="button"
						aria-pressed={paused ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = !paused;
						}}
					>
						{paused ? 'Resume motion' : 'Pause motion'}
					</button>
				</div>
				<div class="drawing">
					<MugArt
						variant="studio"
						reaction="rest"
						mood={mood}
						face={validFace}
						glaze={validGlaze}
						pour={validPour}
						coaster={validCoaster}
						companion={validCompanion}
						paused={paused ? 'true' : 'false'}
						interacted={interacted ? 'true' : 'false'}
					/>
				</div>
				<div
					class="stage-caption"
					aria-live="polite"
					data-action={action ? 'true' : 'false'}
				>
					<strong class="action-caption">{action}</strong>
					<span class="saved-caption-group">
						<strong class="saved-caption caption-neutral">Neutral</strong>
						<strong class="saved-caption caption-attentive">Attentive</strong>
						<strong class="saved-caption caption-surprised">Surprised</strong>
						<strong class="saved-caption caption-excited">Excited</strong>
						<strong class="saved-caption caption-happy">Happy</strong>
						<strong class="saved-caption caption-laughing">Laughing</strong>
						<strong class="saved-caption caption-angry">Angry</strong>
						<strong class="saved-caption caption-sad">Sad</strong>
						<strong class="saved-caption caption-scared">Scared</strong>
						<strong class="saved-caption caption-suspicious">Suspicious</strong>
						<strong class="saved-caption caption-confused">Confused</strong>
						<strong class="saved-caption caption-curious">Curious</strong>
						<strong class="saved-caption caption-proud">Proud</strong>
						<strong class="saved-caption caption-shy">Shy</strong>
						<strong class="saved-caption caption-unimpressed">Unimpressed</strong>
						<strong class="saved-caption caption-sleepy">Sleepy</strong>
					</span>
				</div>
			</section>
			<section class="motion-panel" aria-label="Animation controls">
				<div class="section-title">
					<h2>Make a little moment</h2>
					<span>12 motions</span>
				</div>
				<div class="motions">
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'idle' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = 'Idle';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<path d="M10 11v12q0 5 5 5h7q5 0 5-5V11" />
							<ellipse cx="18.5" cy="11" rx="8.5" ry="2.7" />
							<path d="M27 15c9-2 9 10 0 8" />
							<path d="M15 18v3m7-3v3" />
							<path d="M15 6q-2-2 0-4m7 4q-2-2 0-4" />
						</svg> Idle
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'thinking' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'thinking';
							action = 'Thinking';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<path d="M9 23c-7-2-7-11 0-13 1-7 12-8 16-2 9-2 13 10 5 14H15l-5 5 1-5" />
							<circle cx="12" cy="16" r="1.4" fill="currentColor" />
							<circle cx="20" cy="16" r="1.4" fill="currentColor" />
							<circle cx="28" cy="16" r="1.4" fill="currentColor" />
						</svg> Thinking
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'wink' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'wink';
							action = 'Wink';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<rect
								x="11"
								y="10"
								width="5"
								height="13"
								rx="2.5"
								fill="currentColor"
								stroke="none"
							/>
							<path d="m23 14 6 4-6 4" />
						</svg> Wink
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'wide' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'wide';
							action = 'Wide eyes';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<ellipse cx="12" cy="17" rx="5" ry="8" />
							<ellipse cx="27" cy="17" rx="5" ry="8" />
							<path d="M13 12v3m15-3v3" />
						</svg> Wide eyes
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'notify' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'notify';
							action = 'Notification';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<path d="M9 24h21c-3-3-3-5-3-10 0-10-15-10-15 0 0 5 0 7-3 10Zm8 4q3 3 6 0" />
							<circle cx="29" cy="7" r="4" fill="var(--pink, #efa3bd)" />
						</svg> Notification
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'sleep' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'sleep';
							action = 'Sleep';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<path d="M8 20q4 4 8 0m6 0q4 4 8 0M28 4c-7 0-7 11 0 11-3-4-3-7 0-11Z" />
						</svg> Sleep
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'hello' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'hello';
							action = 'Hello';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<g transform="rotate(5 18 25)">
								<path d="M10 11v12q0 5 5 5h7q5 0 5-5V11" />
								<ellipse cx="18.5" cy="11" rx="8.5" ry="2.7" />
								<path d="M27 15c9-2 9 10 0 8" />
								<path d="M15 18v3m7-3v3" />
							</g>
							<path d="M32 5q4 2 3 6m-1-10q6 3 5 9" />
						</svg> Hello
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'wiggle' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'wiggle';
							action = 'Happy wiggle';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<g transform="rotate(-10 19 19)">
								<path d="M10 11v12q0 5 5 5h7q5 0 5-5V11" />
								<ellipse cx="18.5" cy="11" rx="8.5" ry="2.7" />
								<path d="M27 15c9-2 9 10 0 8" />
								<path d="m14 19 3-2m4 0 3 2" />
							</g>
							<path d="m4 13-2 5m33 4 2-5M12 31l5-1m7 0 5-1" />
						</svg> Happy wiggle
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'sigh' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'sigh';
							action = 'Warm sigh';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<path d="M16 29c-13-8 15-11 6-19-7-6-15 3-8 7 11 5 18-8 11-15" />
						</svg> Warm sigh
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'bow' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'bow';
							action = 'Little bow';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<g transform="translate(0 3) rotate(-12 19 24) scale(1 .85)">
								<path d="M10 11v12q0 5 5 5h7q5 0 5-5V11" />
								<ellipse cx="18.5" cy="11" rx="8.5" ry="2.7" />
								<path d="M27 15c9-2 9 10 0 8" />
								<path d="M14 22h3m4 0h3" />
							</g>
							<path d="M9 5q5-2 9 0m-7-4q5-1 8 2" />
						</svg> Little bow
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'brew' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'brew';
							action = 'Fresh brew';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<ellipse cx="20" cy="22" rx="14" ry="7" />
							<path d="M11 23c-2-8 19-8 19-1 0 6-14 5-13 0 0-2 6-2 6 0M12 10q-3-3 0-6m8 7q-3-4 0-8m8 7q-3-3 0-6" />
						</svg> Fresh brew
					</button>
					<button
						type="button"
						class="motion-pick"
						aria-pressed={mood === 'cheers' ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'cheers';
							action = 'Cheers';
						}}
					>
						<svg class="motion-icon" viewBox="0 0 40 34" aria-hidden="true">
							<g transform="rotate(12 14 18)">
								<path d="M3 10h16l-1 15q-6 4-13 0z" />
								<ellipse cx="11" cy="10" rx="8" ry="2" />
								<path d="M19 14q7 0 0 8" />
							</g>
							<g transform="rotate(-12 29 18)">
								<path d="M23 10h13l-1 13q-5 4-11 0z" />
								<ellipse cx="29.5" cy="10" rx="6.5" ry="2" />
							</g>
							<path d="M20 5V1m-5 5-3-3m13 3 3-3" />
						</svg> Cheers
					</button>
				</div>
				<div class="playback">
					<button
						type="button"
						class="play"
						aria-pressed={playing ? 'true' : 'false'}
						onClick={() => {
							interacted = true;
							run++;
							if (playing) {
								playing = false;
								return;
							}
							const mine = run;
							playing = true;
							paused = false;
							mood = 'idle';
							action = 'Idle';

							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'thinking';
								action = 'Thinking';
							}, 4000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'wink';
								action = 'Wink';
							}, 8000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'wide';
								action = 'Wide eyes';
							}, 12000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'notify';
								action = 'Notification';
							}, 16000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'sleep';
								action = 'Sleep';
							}, 20000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'hello';
								action = 'Hello';
							}, 24000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'wiggle';
								action = 'Happy wiggle';
							}, 28000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'sigh';
								action = 'Warm sigh';
							}, 32000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'bow';
								action = 'Little bow';
							}, 36000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'brew';
								action = 'Fresh brew';
							}, 40000);
							window.setTimeout(() => {
								if (run !== mine) return;
								mood = 'cheers';
								action = 'Cheers';
							}, 44000);
							window.setTimeout(() => {
								if (run !== mine) return;
								playing = false;
								mood = 'idle';
								action = 'Idle';
							}, 48000);
						}}
					>
						{playing ? 'Stop tour' : 'Play all motions'}
						<span aria-hidden="true">{playing ? '■' : '▷'}</span>
					</button>
					<span class="play-note">A 48-second coffee break</span>
				</div>
				<div class="section-title glaze-title">
					<h2>Pick a glaze</h2>
					<span>Same mug. Your color.</span>
				</div>
				<div class="glazes" aria-label="Glaze">
					<button
						type="button"
						class="glaze-pick preference-option glazeCream"
						data-choice="glaze-cream"
						el={glazeCreamUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'cream';
							glazeCreamSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #f7e7bd" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Cream</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeCream"
						data-choice="glaze-cream"
						el={glazeCreamSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'cream';
							glazeCreamSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #f7e7bd" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Cream</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeYellow"
						data-choice="glaze-yellow"
						el={glazeYellowUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'yellow';
							glazeYellowSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #f3d567" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Yellow</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeYellow"
						data-choice="glaze-yellow"
						el={glazeYellowSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'yellow';
							glazeYellowSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #f3d567" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Yellow</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePink"
						data-choice="glaze-pink"
						el={glazePinkUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'pink';
							glazePinkSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #efa3bd" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Pink</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePink"
						data-choice="glaze-pink"
						el={glazePinkSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'pink';
							glazePinkSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #efa3bd" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Pink</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePurple"
						data-choice="glaze-purple"
						el={glazePurpleUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'purple';
							glazePurpleSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #baa1e2" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Lilac</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePurple"
						data-choice="glaze-purple"
						el={glazePurpleSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'purple';
							glazePurpleSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #baa1e2" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Lilac</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeGreen"
						data-choice="glaze-green"
						el={glazeGreenUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'green';
							glazeGreenSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #a5ceb4" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Mint</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeGreen"
						data-choice="glaze-green"
						el={glazeGreenSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'green';
							glazeGreenSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #a5ceb4" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Mint</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeInk"
						data-choice="glaze-ink"
						el={glazeInkUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'ink';
							glazeInkSelected?.focus({ preventScroll: true });
						}}
					>
						<span
							class="swatch"
							style="background: #343432; color: #fffdf6"
							aria-hidden="true"
						>
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Ink</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazeInk"
						data-choice="glaze-ink"
						el={glazeInkSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'ink';
							glazeInkSelected?.focus({ preventScroll: true });
						}}
					>
						<span
							class="swatch"
							style="background: #343432; color: #fffdf6"
							aria-hidden="true"
						>
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Ink</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePaper"
						data-choice="glaze-paper"
						el={glazePaperUnselected}
						aria-pressed="false"
						onClick={() => {
							glaze = 'paper';
							glazePaperSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #faf7ed" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Paper</span>
					</button>
					<button
						type="button"
						class="glaze-pick preference-option glazePaper"
						data-choice="glaze-paper"
						el={glazePaperSelected}
						aria-pressed="true"
						onClick={() => {
							glaze = 'paper';
							glazePaperSelected?.focus({ preventScroll: true });
						}}
					>
						<span class="swatch" style="background: #faf7ed" aria-hidden="true">
							<svg class="swatch-check" viewBox="0 0 16 16">
								<path d="m3 8 3 3 7-7" />
							</svg>
						</span>
						<span class="glaze-label">Paper</span>
					</button>
				</div>
				<div class="pour-title section-title">
					<h2>Pour</h2>
					<span>Latte art</span>
				</div>
				<div class="pours" aria-label="Pour">
					<button
						type="button"
						class="pour-pick preference-option pourRosetta"
						data-choice="pour-rosetta"
						el={pourRosettaUnselected}
						aria-pressed="false"
						onClick={() => {
							pour = 'rosetta';
							pourRosettaSelected?.focus({ preventScroll: true });
						}}
					>
						Rosetta
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourRosetta"
						data-choice="pour-rosetta"
						el={pourRosettaSelected}
						aria-pressed="true"
						onClick={() => {
							pour = 'rosetta';
							pourRosettaSelected?.focus({ preventScroll: true });
						}}
					>
						Rosetta
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourHeart"
						data-choice="pour-heart"
						el={pourHeartUnselected}
						aria-pressed="false"
						onClick={() => {
							pour = 'heart';
							pourHeartSelected?.focus({ preventScroll: true });
						}}
					>
						Heart
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourHeart"
						data-choice="pour-heart"
						el={pourHeartSelected}
						aria-pressed="true"
						onClick={() => {
							pour = 'heart';
							pourHeartSelected?.focus({ preventScroll: true });
						}}
					>
						Heart
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourTulip"
						data-choice="pour-tulip"
						el={pourTulipUnselected}
						aria-pressed="false"
						onClick={() => {
							pour = 'tulip';
							pourTulipSelected?.focus({ preventScroll: true });
						}}
					>
						Tulip
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourTulip"
						data-choice="pour-tulip"
						el={pourTulipSelected}
						aria-pressed="true"
						onClick={() => {
							pour = 'tulip';
							pourTulipSelected?.focus({ preventScroll: true });
						}}
					>
						Tulip
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourMarkless"
						data-choice="pour-markless"
						el={pourMarklessUnselected}
						aria-pressed="false"
						onClick={() => {
							pour = 'markless';
							pourMarklessSelected?.focus({ preventScroll: true });
						}}
					>
						Markless
					</button>
					<button
						type="button"
						class="pour-pick preference-option pourMarkless"
						data-choice="pour-markless"
						el={pourMarklessSelected}
						aria-pressed="true"
						onClick={() => {
							pour = 'markless';
							pourMarklessSelected?.focus({ preventScroll: true });
						}}
					>
						Markless
					</button>
				</div>
			</section>
			<section class="expression-panel" aria-label="Expression controls">
				<div class="section-title">
					<h2>It’s all in the eyes</h2>
					<span>Choose a face to try it on</span>
				</div>
				<div class="expressions">
					<button
						type="button"
						class="face-pick preference-option expressionNeutral"
						data-choice="expression-neutral"
						el={expressionNeutralUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'neutral';
							expressionNeutralSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="neutral" />
						<span>Neutral</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionNeutral"
						data-choice="expression-neutral"
						el={expressionNeutralSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'neutral';
							expressionNeutralSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="neutral" />
						<span>Neutral</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionAttentive"
						data-choice="expression-attentive"
						el={expressionAttentiveUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'attentive';
							expressionAttentiveSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="attentive" />
						<span>Attentive</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionAttentive"
						data-choice="expression-attentive"
						el={expressionAttentiveSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'attentive';
							expressionAttentiveSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="attentive" />
						<span>Attentive</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSurprised"
						data-choice="expression-surprised"
						el={expressionSurprisedUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'surprised';
							expressionSurprisedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="surprised" />
						<span>Surprised</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSurprised"
						data-choice="expression-surprised"
						el={expressionSurprisedSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'surprised';
							expressionSurprisedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="surprised" />
						<span>Surprised</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionExcited"
						data-choice="expression-excited"
						el={expressionExcitedUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'excited';
							expressionExcitedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="excited" />
						<span>Excited</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionExcited"
						data-choice="expression-excited"
						el={expressionExcitedSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'excited';
							expressionExcitedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="excited" />
						<span>Excited</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionHappy"
						data-choice="expression-happy"
						el={expressionHappyUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'happy';
							expressionHappySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="happy" />
						<span>Happy</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionHappy"
						data-choice="expression-happy"
						el={expressionHappySelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'happy';
							expressionHappySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="happy" />
						<span>Happy</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionLaughing"
						data-choice="expression-laughing"
						el={expressionLaughingUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'laughing';
							expressionLaughingSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="laughing" />
						<span>Laughing</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionLaughing"
						data-choice="expression-laughing"
						el={expressionLaughingSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'laughing';
							expressionLaughingSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="laughing" />
						<span>Laughing</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionAngry"
						data-choice="expression-angry"
						el={expressionAngryUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'angry';
							expressionAngrySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="angry" />
						<span>Angry</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionAngry"
						data-choice="expression-angry"
						el={expressionAngrySelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'angry';
							expressionAngrySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="angry" />
						<span>Angry</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSad"
						data-choice="expression-sad"
						el={expressionSadUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'sad';
							expressionSadSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="sad" />
						<span>Sad</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSad"
						data-choice="expression-sad"
						el={expressionSadSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'sad';
							expressionSadSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="sad" />
						<span>Sad</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionScared"
						data-choice="expression-scared"
						el={expressionScaredUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'scared';
							expressionScaredSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="scared" />
						<span>Scared</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionScared"
						data-choice="expression-scared"
						el={expressionScaredSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'scared';
							expressionScaredSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="scared" />
						<span>Scared</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSuspicious"
						data-choice="expression-suspicious"
						el={expressionSuspiciousUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'suspicious';
							expressionSuspiciousSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="suspicious" />
						<span>Suspicious</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSuspicious"
						data-choice="expression-suspicious"
						el={expressionSuspiciousSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'suspicious';
							expressionSuspiciousSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="suspicious" />
						<span>Suspicious</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionConfused"
						data-choice="expression-confused"
						el={expressionConfusedUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'confused';
							expressionConfusedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="confused" />
						<span>Confused</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionConfused"
						data-choice="expression-confused"
						el={expressionConfusedSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'confused';
							expressionConfusedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="confused" />
						<span>Confused</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionCurious"
						data-choice="expression-curious"
						el={expressionCuriousUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'curious';
							expressionCuriousSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="curious" />
						<span>Curious</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionCurious"
						data-choice="expression-curious"
						el={expressionCuriousSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'curious';
							expressionCuriousSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="curious" />
						<span>Curious</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionProud"
						data-choice="expression-proud"
						el={expressionProudUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'proud';
							expressionProudSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="proud" />
						<span>Proud</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionProud"
						data-choice="expression-proud"
						el={expressionProudSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'proud';
							expressionProudSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="proud" />
						<span>Proud</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionShy"
						data-choice="expression-shy"
						el={expressionShyUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'shy';
							expressionShySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="shy" />
						<span>Shy</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionShy"
						data-choice="expression-shy"
						el={expressionShySelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'shy';
							expressionShySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="shy" />
						<span>Shy</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionUnimpressed"
						data-choice="expression-unimpressed"
						el={expressionUnimpressedUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'unimpressed';
							expressionUnimpressedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="unimpressed" />
						<span>Unimpressed</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionUnimpressed"
						data-choice="expression-unimpressed"
						el={expressionUnimpressedSelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'unimpressed';
							expressionUnimpressedSelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="unimpressed" />
						<span>Unimpressed</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSleepy"
						data-choice="expression-sleepy"
						el={expressionSleepyUnselected}
						aria-pressed="false"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'sleepy';
							expressionSleepySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="sleepy" />
						<span>Sleepy</span>
					</button>
					<button
						type="button"
						class="face-pick preference-option expressionSleepy"
						data-choice="expression-sleepy"
						el={expressionSleepySelected}
						aria-pressed="true"
						onClick={() => {
							interacted = true;
							run++;
							playing = false;
							paused = false;
							mood = 'idle';
							action = '';

							interacted = true;
							face = 'sleepy';
							expressionSleepySelected?.focus({ preventScroll: true });
						}}
					>
						<FacePreview expression="sleepy" />
						<span>Sleepy</span>
					</button>
				</div>
			</section>
			<section class="decoration-controls" aria-label="Decoration comparisons">
				<div class="section-title">
					<h2>On the desk</h2>
				</div>
				<div class="decoration-grid">
					<fieldset>
						<legend>Coaster</legend>
						<div class="decoration-options">
							<button
								type="button"
								class="coaster-pick preference-option coasterOff"
								data-choice="coaster-off"
								el={coasterOffUnselected}
								aria-pressed="false"
								onClick={() => {
									coaster = 'off';
									coasterOffSelected?.focus({ preventScroll: true });
								}}
							>
								No coaster
							</button>
							<button
								type="button"
								class="coaster-pick preference-option coasterOff"
								data-choice="coaster-off"
								el={coasterOffSelected}
								aria-pressed="true"
								onClick={() => {
									coaster = 'off';
									coasterOffSelected?.focus({ preventScroll: true });
								}}
							>
								No coaster
							</button>
							<button
								type="button"
								class="coaster-pick preference-option coasterCork"
								data-choice="coaster-cork"
								el={coasterCorkUnselected}
								aria-pressed="false"
								onClick={() => {
									coaster = 'cork';
									coasterCorkSelected?.focus({ preventScroll: true });
								}}
							>
								Cork
							</button>
							<button
								type="button"
								class="coaster-pick preference-option coasterCork"
								data-choice="coaster-cork"
								el={coasterCorkSelected}
								aria-pressed="true"
								onClick={() => {
									coaster = 'cork';
									coasterCorkSelected?.focus({ preventScroll: true });
								}}
							>
								Cork
							</button>
						</div>
					</fieldset>
					<fieldset>
						<legend>Beside the mug</legend>
						<div class="decoration-options">
							<button
								type="button"
								class="companion-pick preference-option companionOff"
								data-choice="companion-off"
								el={companionOffUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'off';
									companionOffSelected?.focus({ preventScroll: true });
								}}
							>
								Nothing beside
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionOff"
								data-choice="companion-off"
								el={companionOffSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'off';
									companionOffSelected?.focus({ preventScroll: true });
								}}
							>
								Nothing beside
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionBeans"
								data-choice="companion-beans"
								el={companionBeansUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'beans';
									companionBeansSelected?.focus({ preventScroll: true });
								}}
							>
								Coffee beans
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionBeans"
								data-choice="companion-beans"
								el={companionBeansSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'beans';
									companionBeansSelected?.focus({ preventScroll: true });
								}}
							>
								Coffee beans
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionSugar"
								data-choice="companion-sugar"
								el={companionSugarUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'sugar';
									companionSugarSelected?.focus({ preventScroll: true });
								}}
							>
								Sugar cubes
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionSugar"
								data-choice="companion-sugar"
								el={companionSugarSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'sugar';
									companionSugarSelected?.focus({ preventScroll: true });
								}}
							>
								Sugar cubes
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionCrane"
								data-choice="companion-crane"
								el={companionCraneUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'crane';
									companionCraneSelected?.focus({ preventScroll: true });
								}}
							>
								Paper crane
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionCrane"
								data-choice="companion-crane"
								el={companionCraneSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'crane';
									companionCraneSelected?.focus({ preventScroll: true });
								}}
							>
								Paper crane
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionEucalyptus"
								data-choice="companion-eucalyptus"
								el={companionEucalyptusUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'eucalyptus';
									companionEucalyptusSelected?.focus({ preventScroll: true });
								}}
							>
								Eucalyptus
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionEucalyptus"
								data-choice="companion-eucalyptus"
								el={companionEucalyptusSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'eucalyptus';
									companionEucalyptusSelected?.focus({ preventScroll: true });
								}}
							>
								Eucalyptus
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionNotes"
								data-choice="companion-notes"
								el={companionNotesUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'notes';
									companionNotesSelected?.focus({ preventScroll: true });
								}}
							>
								Field notes
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionNotes"
								data-choice="companion-notes"
								el={companionNotesSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'notes';
									companionNotesSelected?.focus({ preventScroll: true });
								}}
							>
								Field notes
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionMoka"
								data-choice="companion-moka"
								el={companionMokaUnselected}
								aria-pressed="false"
								onClick={() => {
									companion = 'moka';
									companionMokaSelected?.focus({ preventScroll: true });
								}}
							>
								Little moka
							</button>
							<button
								type="button"
								class="companion-pick preference-option companionMoka"
								data-choice="companion-moka"
								el={companionMokaSelected}
								aria-pressed="true"
								onClick={() => {
									companion = 'moka';
									companionMokaSelected?.focus({ preventScroll: true });
								}}
							>
								Little moka
							</button>
						</div>
					</fieldset>
				</div>
			</section>
		</div>
		<style>
 .mascot { --spring: linear(0, 0.027 1.1%, 0.103 2.3%, 0.583 7.5%, 0.792 10.4%, 0.932 13.6%, 0.977 15.4%, 1.006 17.4%, 1.02 19.4%, 1.024 21.7%, 1 38.4%, 1); --snap: linear(0, 0.029 0.8%, 0.13 1.8%, 0.908 7.2%, 1.051 9.1%, 1.112 11.2%, 1.116 12.2%, 1.106 13.4%, 1.007 19.5%, 0.987 23.1%, 1.001 35%, 1); container-type: inline-size; margin: 1.5rem 0 2rem; color: var(--ink); }
 .studio { --lilac: #d9c8ef; --accent: #f3d567; display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--ink); border-radius: 3px; box-shadow: 3px 3px 0 var(--lilac); background: color-mix(in srgb, var(--paper) 70%, transparent); overflow: clip; }
 .stage { min-width: 0; display: flex; flex-direction: column; border-right: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); padding: 18px; }
 .stage-top { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
 .eyebrow { font-size: 11px; line-height: 1.4; max-width: 100px; opacity: .7; }
 button { font: inherit; color: inherit; cursor: pointer; border: 1px solid var(--ink); background: color-mix(in srgb, var(--paper) 85%, transparent); border-radius: 3px; box-shadow: 0 2px 0 var(--lilac); touch-action: manipulation; }
 button:hover { background: color-mix(in srgb, var(--lilac) 35%, var(--paper)); }
 button:focus-visible { outline: 1px dashed var(--ink); outline-offset: 4px; }
 button[aria-pressed='true'] { background: color-mix(in srgb, var(--lilac) 48%, var(--paper)); border-color: var(--ink); box-shadow: none; }
 .pause { padding: 6px 8px; font-size: 12px; white-space: nowrap; }
 .drawing { --mug-width:min(100%,275px); --mug-height:320px; position: relative; min-height: 300px; flex: 1; display: grid; place-items: center; }

 .stage-caption { display: grid; text-align: center; gap: 4px; padding: 4px 0 8px; min-height: 34px; }
 .stage-caption strong { font-size: 19px; font-weight: 600; }

 .motion-panel { padding: 20px 18px; min-width: 0; }
 .section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 13px; flex-wrap: wrap; }
 .section-title h2 { font-family: 'Joy Elia', cursive; font-size: 24px; line-height: 1.2; font-weight: 500; margin: 0; border: 0; padding: 0; text-shadow: -1px 1px 0 var(--lilac); }
 .section-title > span { font-size: 10px; opacity: .7; }
 .motions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
 .motion-pick { min-height: 62px; display: grid; place-content: center; gap: 2px; padding: 5px 2px; font-size: 12px; line-height: 1.3; }
 .motion-icon { width: 32px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; justify-self: center; overflow: visible; }
 .playback { margin: 16px 0 24px; display: grid; gap: 6px; }
 .play { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--accent); color: #292728; border-color: #292728; padding: 9px 12px; font-size: 13px; box-shadow: 0 2px 0 var(--lilac); }
 .play:hover { background: #ffe28a; }
 .play-note { font-size: 10px; opacity: .65; }
 .glaze-title { margin-bottom: 10px; }
 .glazes { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
 .glaze-pick, .glaze-pick[aria-pressed='true'], .glaze-pick:hover { border: 0; background: transparent; box-shadow: none; }
 .glaze-pick { font-size: 11px; padding: 7px 2px; min-height: 48px; display: grid; gap: 7px; justify-items: center; }
 .swatch { width: 100%; height: 23px; border: 1px solid var(--ink); border-radius: 2px; display: grid; place-items: center; color: #2d2b2a; }
 .swatch-check { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
 .glaze-pick[aria-pressed='true'] .swatch-check { opacity: 1; }
 .glaze-pick[aria-pressed='true'] .glaze-label { text-decoration: underline; text-decoration-color: var(--lilac); text-decoration-thickness: 2px; text-underline-offset: 4px; }
 .expression-panel { grid-column: 1 / -1; border-top: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); padding: 18px; }
 .expressions { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 7px; }
 .face-pick { min-width: 0; display: grid; justify-items: center; padding: 2px 1px 7px; font-size: 12px; line-height: 1.2; }
 .face-preview { width: 66px; max-width: 100%; height: 44px; fill: currentColor; }
 .pour-title { margin: 18px 0 10px; }
 .pours { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
 .pour-pick { min-height: 44px; padding: 6px 2px; font-size: 12px; }
 @container (max-width: 800px) { .expressions { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
 @container (max-width: 620px) { .studio { display: block; } .stage { position: sticky; top: var(--header-height); z-index: 3; display: grid; grid-template-columns: 125px minmax(0, 1fr); gap: 4px 10px; align-items: center; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--ink); background: var(--paper); } .stage-top { grid-column: 2; grid-row: 1; align-self: end; } .eyebrow { display: none; } .drawing { --mug-width:125px; --mug-height:150px; grid-column: 1; grid-row: 1 / span 2; min-height: 150px; } .stage-caption { grid-column: 2; grid-row: 2; align-self: start; text-align: left; min-height: 0; } .stage-caption strong { font-size: 17px; } .stage-caption span { font-size: 11px; } .motion-panel { padding: 20px 16px; } .motion-pick { font-size: 12px; } .expressions { grid-template-columns: repeat(4, minmax(0, 1fr)); } .face-pick { font-size: 12px; } .face-pick span { overflow-wrap: anywhere; } .swatch { height: 27px; } .glaze-pick { font-size: 11px; } }
 
 .decoration-controls { grid-column:1/-1; padding:18px; border-top:1px solid color-mix(in srgb,var(--ink) 25%,transparent); }
 .decoration-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
 .decoration-controls fieldset { min-width:0; margin:0; padding:0; border:0; }
 .decoration-controls legend { font-size:14px; margin-bottom:8px; }
 .decoration-options { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
 .decoration-options button { font-size:12px; min-height:44px; padding:7px 9px; }
 .decoration-controls p { font-size:11px; line-height:1.5; margin:7px 0 0; opacity:.75; }
 .decoration-controls output { font-size:12px; padding:4px; }
 @container(max-width:620px) { .decoration-grid { grid-template-columns:1fr; } }

 @container(min-width:621px) {
  .stage { position:sticky; top:calc(var(--header-height) + 8px); grid-row:1 / span 3; height:calc(100svh - var(--header-height) - 24px); max-height:min(420px,50svh); align-self:start; }
  .stage .drawing { min-height:0; --mug-height:min(320px,calc(50svh - 84px)); }
 
  .expression-panel,.decoration-controls { grid-column:2; border-left:1px solid color-mix(in srgb,var(--ink) 25%,transparent); }
  .expressions { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .decoration-grid { grid-template-columns:1fr; }
 }

.glazeCream[aria-pressed='true'] { display:none; html:not(:is([data-mascot-glaze='yellow'],[data-mascot-glaze='pink'],[data-mascot-glaze='purple'],[data-mascot-glaze='green'],[data-mascot-glaze='ink'],[data-mascot-glaze='paper'])) & { display:grid; } }
.glazeCream[aria-pressed='false'] { display:grid; html:not(:is([data-mascot-glaze='yellow'],[data-mascot-glaze='pink'],[data-mascot-glaze='purple'],[data-mascot-glaze='green'],[data-mascot-glaze='ink'],[data-mascot-glaze='paper'])) & { display:none; } }
.glazeYellow[aria-pressed='true'] { display:none; html[data-mascot-glaze='yellow'] & { display:grid; } }
.glazeYellow[aria-pressed='false'] { display:grid; html[data-mascot-glaze='yellow'] & { display:none; } }
.glazePink[aria-pressed='true'] { display:none; html[data-mascot-glaze='pink'] & { display:grid; } }
.glazePink[aria-pressed='false'] { display:grid; html[data-mascot-glaze='pink'] & { display:none; } }
.glazePurple[aria-pressed='true'] { display:none; html[data-mascot-glaze='purple'] & { display:grid; } }
.glazePurple[aria-pressed='false'] { display:grid; html[data-mascot-glaze='purple'] & { display:none; } }
.glazeGreen[aria-pressed='true'] { display:none; html[data-mascot-glaze='green'] & { display:grid; } }
.glazeGreen[aria-pressed='false'] { display:grid; html[data-mascot-glaze='green'] & { display:none; } }
.glazeInk[aria-pressed='true'] { display:none; html[data-mascot-glaze='ink'] & { display:grid; } }
.glazeInk[aria-pressed='false'] { display:grid; html[data-mascot-glaze='ink'] & { display:none; } }
.glazePaper[aria-pressed='true'] { display:none; html[data-mascot-glaze='paper'] & { display:grid; } }
.glazePaper[aria-pressed='false'] { display:grid; html[data-mascot-glaze='paper'] & { display:none; } }
.pourRosetta[aria-pressed='true'] { display:none; html:not(:is([data-mascot-pour='heart'],[data-mascot-pour='tulip'],[data-mascot-pour='markless'])) & { display:inline-block; } }
.pourRosetta[aria-pressed='false'] { display:inline-block; html:not(:is([data-mascot-pour='heart'],[data-mascot-pour='tulip'],[data-mascot-pour='markless'])) & { display:none; } }
.pourHeart[aria-pressed='true'] { display:none; html[data-mascot-pour='heart'] & { display:inline-block; } }
.pourHeart[aria-pressed='false'] { display:inline-block; html[data-mascot-pour='heart'] & { display:none; } }
.pourTulip[aria-pressed='true'] { display:none; html[data-mascot-pour='tulip'] & { display:inline-block; } }
.pourTulip[aria-pressed='false'] { display:inline-block; html[data-mascot-pour='tulip'] & { display:none; } }
.pourMarkless[aria-pressed='true'] { display:none; html[data-mascot-pour='markless'] & { display:inline-block; } }
.pourMarkless[aria-pressed='false'] { display:inline-block; html[data-mascot-pour='markless'] & { display:none; } }
.expressionNeutral[aria-pressed='true'] { display:none; html:not(:is([data-mascot-expression='attentive'],[data-mascot-expression='surprised'],[data-mascot-expression='excited'],[data-mascot-expression='happy'],[data-mascot-expression='laughing'],[data-mascot-expression='angry'],[data-mascot-expression='sad'],[data-mascot-expression='scared'],[data-mascot-expression='suspicious'],[data-mascot-expression='confused'],[data-mascot-expression='curious'],[data-mascot-expression='proud'],[data-mascot-expression='shy'],[data-mascot-expression='unimpressed'],[data-mascot-expression='sleepy'])) & { display:grid; } }
.expressionNeutral[aria-pressed='false'] { display:grid; html:not(:is([data-mascot-expression='attentive'],[data-mascot-expression='surprised'],[data-mascot-expression='excited'],[data-mascot-expression='happy'],[data-mascot-expression='laughing'],[data-mascot-expression='angry'],[data-mascot-expression='sad'],[data-mascot-expression='scared'],[data-mascot-expression='suspicious'],[data-mascot-expression='confused'],[data-mascot-expression='curious'],[data-mascot-expression='proud'],[data-mascot-expression='shy'],[data-mascot-expression='unimpressed'],[data-mascot-expression='sleepy'])) & { display:none; } }
.expressionAttentive[aria-pressed='true'] { display:none; html[data-mascot-expression='attentive'] & { display:grid; } }
.expressionAttentive[aria-pressed='false'] { display:grid; html[data-mascot-expression='attentive'] & { display:none; } }
.expressionSurprised[aria-pressed='true'] { display:none; html[data-mascot-expression='surprised'] & { display:grid; } }
.expressionSurprised[aria-pressed='false'] { display:grid; html[data-mascot-expression='surprised'] & { display:none; } }
.expressionExcited[aria-pressed='true'] { display:none; html[data-mascot-expression='excited'] & { display:grid; } }
.expressionExcited[aria-pressed='false'] { display:grid; html[data-mascot-expression='excited'] & { display:none; } }
.expressionHappy[aria-pressed='true'] { display:none; html[data-mascot-expression='happy'] & { display:grid; } }
.expressionHappy[aria-pressed='false'] { display:grid; html[data-mascot-expression='happy'] & { display:none; } }
.expressionLaughing[aria-pressed='true'] { display:none; html[data-mascot-expression='laughing'] & { display:grid; } }
.expressionLaughing[aria-pressed='false'] { display:grid; html[data-mascot-expression='laughing'] & { display:none; } }
.expressionAngry[aria-pressed='true'] { display:none; html[data-mascot-expression='angry'] & { display:grid; } }
.expressionAngry[aria-pressed='false'] { display:grid; html[data-mascot-expression='angry'] & { display:none; } }
.expressionSad[aria-pressed='true'] { display:none; html[data-mascot-expression='sad'] & { display:grid; } }
.expressionSad[aria-pressed='false'] { display:grid; html[data-mascot-expression='sad'] & { display:none; } }
.expressionScared[aria-pressed='true'] { display:none; html[data-mascot-expression='scared'] & { display:grid; } }
.expressionScared[aria-pressed='false'] { display:grid; html[data-mascot-expression='scared'] & { display:none; } }
.expressionSuspicious[aria-pressed='true'] { display:none; html[data-mascot-expression='suspicious'] & { display:grid; } }
.expressionSuspicious[aria-pressed='false'] { display:grid; html[data-mascot-expression='suspicious'] & { display:none; } }
.expressionConfused[aria-pressed='true'] { display:none; html[data-mascot-expression='confused'] & { display:grid; } }
.expressionConfused[aria-pressed='false'] { display:grid; html[data-mascot-expression='confused'] & { display:none; } }
.expressionCurious[aria-pressed='true'] { display:none; html[data-mascot-expression='curious'] & { display:grid; } }
.expressionCurious[aria-pressed='false'] { display:grid; html[data-mascot-expression='curious'] & { display:none; } }
.expressionProud[aria-pressed='true'] { display:none; html[data-mascot-expression='proud'] & { display:grid; } }
.expressionProud[aria-pressed='false'] { display:grid; html[data-mascot-expression='proud'] & { display:none; } }
.expressionShy[aria-pressed='true'] { display:none; html[data-mascot-expression='shy'] & { display:grid; } }
.expressionShy[aria-pressed='false'] { display:grid; html[data-mascot-expression='shy'] & { display:none; } }
.expressionUnimpressed[aria-pressed='true'] { display:none; html[data-mascot-expression='unimpressed'] & { display:grid; } }
.expressionUnimpressed[aria-pressed='false'] { display:grid; html[data-mascot-expression='unimpressed'] & { display:none; } }
.expressionSleepy[aria-pressed='true'] { display:none; html[data-mascot-expression='sleepy'] & { display:grid; } }
.expressionSleepy[aria-pressed='false'] { display:grid; html[data-mascot-expression='sleepy'] & { display:none; } }
.coasterOff[aria-pressed='true'] { display:none; html:not(:is([data-mascot-coaster='cork'])) & { display:inline-block; } }
.coasterOff[aria-pressed='false'] { display:inline-block; html:not(:is([data-mascot-coaster='cork'])) & { display:none; } }
.coasterCork[aria-pressed='true'] { display:none; html[data-mascot-coaster='cork'] & { display:inline-block; } }
.coasterCork[aria-pressed='false'] { display:inline-block; html[data-mascot-coaster='cork'] & { display:none; } }
.companionOff[aria-pressed='true'] { display:none; html:not(:is([data-mascot-companion='beans'],[data-mascot-companion='sugar'],[data-mascot-companion='crane'],[data-mascot-companion='eucalyptus'],[data-mascot-companion='notes'],[data-mascot-companion='moka'])) & { display:inline-block; } }
.companionOff[aria-pressed='false'] { display:inline-block; html:not(:is([data-mascot-companion='beans'],[data-mascot-companion='sugar'],[data-mascot-companion='crane'],[data-mascot-companion='eucalyptus'],[data-mascot-companion='notes'],[data-mascot-companion='moka'])) & { display:none; } }
.companionBeans[aria-pressed='true'] { display:none; html[data-mascot-companion='beans'] & { display:inline-block; } }
.companionBeans[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='beans'] & { display:none; } }
.companionSugar[aria-pressed='true'] { display:none; html[data-mascot-companion='sugar'] & { display:inline-block; } }
.companionSugar[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='sugar'] & { display:none; } }
.companionCrane[aria-pressed='true'] { display:none; html[data-mascot-companion='crane'] & { display:inline-block; } }
.companionCrane[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='crane'] & { display:none; } }
.companionEucalyptus[aria-pressed='true'] { display:none; html[data-mascot-companion='eucalyptus'] & { display:inline-block; } }
.companionEucalyptus[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='eucalyptus'] & { display:none; } }
.companionNotes[aria-pressed='true'] { display:none; html[data-mascot-companion='notes'] & { display:inline-block; } }
.companionNotes[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='notes'] & { display:none; } }
.companionMoka[aria-pressed='true'] { display:none; html[data-mascot-companion='moka'] & { display:inline-block; } }
.companionMoka[aria-pressed='false'] { display:inline-block; html[data-mascot-companion='moka'] & { display:none; } }
.caption-neutral { display:inline; html:not(:is([data-mascot-expression='attentive'],[data-mascot-expression='surprised'],[data-mascot-expression='excited'],[data-mascot-expression='happy'],[data-mascot-expression='laughing'],[data-mascot-expression='angry'],[data-mascot-expression='sad'],[data-mascot-expression='scared'],[data-mascot-expression='suspicious'],[data-mascot-expression='confused'],[data-mascot-expression='curious'],[data-mascot-expression='proud'],[data-mascot-expression='shy'],[data-mascot-expression='unimpressed'],[data-mascot-expression='sleepy'])) & { display:inline; } }
.caption-attentive { display:none; html[data-mascot-expression='attentive'] & { display:inline; } }
.caption-surprised { display:none; html[data-mascot-expression='surprised'] & { display:inline; } }
.caption-excited { display:none; html[data-mascot-expression='excited'] & { display:inline; } }
.caption-happy { display:none; html[data-mascot-expression='happy'] & { display:inline; } }
.caption-laughing { display:none; html[data-mascot-expression='laughing'] & { display:inline; } }
.caption-angry { display:none; html[data-mascot-expression='angry'] & { display:inline; } }
.caption-sad { display:none; html[data-mascot-expression='sad'] & { display:inline; } }
.caption-scared { display:none; html[data-mascot-expression='scared'] & { display:inline; } }
.caption-suspicious { display:none; html[data-mascot-expression='suspicious'] & { display:inline; } }
.caption-confused { display:none; html[data-mascot-expression='confused'] & { display:inline; } }
.caption-curious { display:none; html[data-mascot-expression='curious'] & { display:inline; } }
.caption-proud { display:none; html[data-mascot-expression='proud'] & { display:inline; } }
.caption-shy { display:none; html[data-mascot-expression='shy'] & { display:inline; } }
.caption-unimpressed { display:none; html[data-mascot-expression='unimpressed'] & { display:inline; } }
.caption-sleepy { display:none; html[data-mascot-expression='sleepy'] & { display:inline; } }
.caption-neutral { html:is([data-mascot-expression='attentive'],[data-mascot-expression='surprised'],[data-mascot-expression='excited'],[data-mascot-expression='happy'],[data-mascot-expression='laughing'],[data-mascot-expression='angry'],[data-mascot-expression='sad'],[data-mascot-expression='scared'],[data-mascot-expression='suspicious'],[data-mascot-expression='confused'],[data-mascot-expression='curious'],[data-mascot-expression='proud'],[data-mascot-expression='shy'],[data-mascot-expression='unimpressed'],[data-mascot-expression='sleepy']) & { display:none; } }
.stage-caption[data-action="false"] .action-caption { display:none; }
.stage-caption[data-action="true"] .saved-caption-group { display:none; }
</style>
	</div>;
}
