import { computed, state } from '@markless/core';
import Layout from '../src/layout.tsrx';
import { tabForKey } from '../src/tabs.ts';
import {
	COUNTER_INITIAL,
	FILTER_ITEMS,
	INITIAL_TAB,
	OVERVIEW_PROSE,
	STEPPER_INITIAL,
	STEPPER_MAX,
	STEPPER_MIN,
	TABS,
	filterCountText,
	filterItems,
	stepperDerivedText,
	toggleStatusText,
} from '../src/shared/data.ts';

const [summaryTab, activityTab, notesTab] = TABS;

export default function Overview() @{
	let count = state(COUNTER_INITIAL);
	let notifications = state(false);
	let stepper = state(STEPPER_INITIAL);
	let selectedTab = state(INITIAL_TAB);
	let query = state('');
	const selected = computed(() => TABS.find((tab) => tab.id === selectedTab)!);
	const matches = computed(() => filterItems(FILTER_ITEMS, query));
	const filterCount = computed(() => filterCountText(matches.length));
	const noMatches = computed(() => matches.length === 0);
	const toggleStatus = computed(() => toggleStatusText(notifications));
	const stepperDerived = computed(() => stepperDerivedText(stepper));
	const atStepperMin = computed(() => stepper <= STEPPER_MIN);
	const atStepperMax = computed(() => stepper >= STEPPER_MAX);
	const selectedContent = computed(() => selected.content);
	const selectedLabelledBy = computed(() => `tab-${selected.id}`);

	<Layout route="overview">
		<div class="prose">
			@for (const paragraph of OVERVIEW_PROSE; index i; key i) {
				<p>{paragraph}</p>
			}
		</div>
		<h2 class="section-title">Panels</h2>
		<div class="panels">
			<section class="panel">
				<h3 class="panel-title">Counter</h3>
				<output class="value" data-testid="counter-value">{count}</output>
				<button type="button" class="button" data-testid="counter-increment" onClick={() => count++}>Increment</button>
			</section>
			<section class="panel">
				<h3 class="panel-title">Toggle</h3>
				<button
					type="button"
					class="button"
					data-testid="toggle-button"
					aria-pressed={notifications ? 'true' : 'false'}
					onClick={() => (notifications = !notifications)}
				>Notifications</button>
				<output class="value" data-testid="toggle-status">{toggleStatus}</output>
			</section>
			<section class="panel">
				<h3 class="panel-title">Stepper</h3>
				<div class="row">
					<button
						type="button"
						class="button"
						data-testid="stepper-decrement"
						aria-label="Decrease"
						disabled={atStepperMin}
						onClick={() => (stepper = Math.max(STEPPER_MIN, stepper - 1))}
					>{'−'}</button>
					<output class="value" data-testid="stepper-value">{stepper}</output>
					<button
						type="button"
						class="button"
						data-testid="stepper-increment"
						aria-label="Increase"
						disabled={atStepperMax}
						onClick={() => (stepper = Math.min(STEPPER_MAX, stepper + 1))}
					>+</button>
				</div>
				<p class="derived" data-testid="stepper-derived">{stepperDerived}</p>
			</section>
		</div>
		<div class="tabs">
			<div class="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
				<button
					type="button"
					class="tab"
					role="tab"
					id={`tab-${summaryTab!.id}`}
					data-testid={`tab-${summaryTab!.id}`}
					aria-controls="tab-panel"
					aria-selected={selectedTab === summaryTab!.id ? 'true' : 'false'}
					tabindex={selectedTab === summaryTab!.id ? 0 : -1}
					onClick={() => (selectedTab = summaryTab!.id)}
					onKeydown={(event) => {
						const next = tabForKey(event.key, summaryTab!.id);
						if (next === null) return;
						event.preventDefault();
						selectedTab = next;
						document.getElementById(`tab-${next}`)?.focus();
					}}
				>{summaryTab!.label}</button>
				<button
					type="button"
					class="tab"
					role="tab"
					id={`tab-${activityTab!.id}`}
					data-testid={`tab-${activityTab!.id}`}
					aria-controls="tab-panel"
					aria-selected={selectedTab === activityTab!.id ? 'true' : 'false'}
					tabindex={selectedTab === activityTab!.id ? 0 : -1}
					onClick={() => (selectedTab = activityTab!.id)}
					onKeydown={(event) => {
						const next = tabForKey(event.key, activityTab!.id);
						if (next === null) return;
						event.preventDefault();
						selectedTab = next;
						document.getElementById(`tab-${next}`)?.focus();
					}}
				>{activityTab!.label}</button>
				<button
					type="button"
					class="tab"
					role="tab"
					id={`tab-${notesTab!.id}`}
					data-testid={`tab-${notesTab!.id}`}
					aria-controls="tab-panel"
					aria-selected={selectedTab === notesTab!.id ? 'true' : 'false'}
					tabindex={selectedTab === notesTab!.id ? 0 : -1}
					onClick={() => (selectedTab = notesTab!.id)}
					onKeydown={(event) => {
						const next = tabForKey(event.key, notesTab!.id);
						if (next === null) return;
						event.preventDefault();
						selectedTab = next;
						document.getElementById(`tab-${next}`)?.focus();
					}}
				>{notesTab!.label}</button>
			</div>
			<div
				class="tabpanel"
				role="tabpanel"
				id="tab-panel"
				data-testid="tab-panel"
				aria-labelledby={selectedLabelledBy}
				tabindex={0}
			>{selectedContent}</div>
		</div>
		<section class="filter">
			<div class="field">
				<label class="field-label" for="filter-input">Filter items</label>
				<input
					class="input"
					type="search"
					id="filter-input"
					data-testid="filter-input"
					autocomplete="off"
					value={query}
					onInput={(event) => (query = (event.target as HTMLInputElement).value)}
				/>
			</div>
			<p class="muted" data-testid="filter-count">{filterCount}</p>
			<ul class="list" data-testid="filter-list">
				@for (const item of matches; key item) {
					<li data-testid="filter-item">{item}</li>
				}
			</ul>
			@if (noMatches) {
				<p class="muted" data-testid="filter-empty">No matching items</p>
			}
		</section>
	</Layout>
}
