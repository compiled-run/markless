import { track } from 'ripple';
import { AppShell } from '../components/AppShell.tsrx';
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
	type TabInfo,
} from '../shared/data.ts';

function CounterPanel() @{
	const count = track(COUNTER_INITIAL);

	<section class="panel">
		<h3 class="panel-title">Counter</h3>
		<output class="value" data-testid="counter-value">{count.value}</output>
		<button type="button" class="button" data-testid="counter-increment" onClick={() => count.value++}>
			Increment
		</button>
	</section>
}

function TogglePanel() @{
	const on = track(false);

	<section class="panel">
		<h3 class="panel-title">Toggle</h3>
		<button
			type="button"
			class="button"
			data-testid="toggle-button"
			aria-pressed={on.value ? 'true' : 'false'}
			onClick={() => (on.value = !on.value)}
		>
			Notifications
		</button>
		<output class="value" data-testid="toggle-status">{toggleStatusText(on.value)}</output>
	</section>
}

function StepperPanel() @{
	const value = track(STEPPER_INITIAL);

	<section class="panel">
		<h3 class="panel-title">Stepper</h3>
		<div class="row">
			<button
				type="button"
				class="button"
				data-testid="stepper-decrement"
				aria-label="Decrease"
				disabled={value.value <= STEPPER_MIN}
				onClick={() => (value.value = Math.max(STEPPER_MIN, value.value - 1))}
			>
				−
			</button>
			<output class="value" data-testid="stepper-value">{value.value}</output>
			<button
				type="button"
				class="button"
				data-testid="stepper-increment"
				aria-label="Increase"
				disabled={value.value >= STEPPER_MAX}
				onClick={() => (value.value = Math.min(STEPPER_MAX, value.value + 1))}
			>
				+
			</button>
		</div>
		<p class="derived" data-testid="stepper-derived">{stepperDerivedText(value.value)}</p>
	</section>
}

function Tabs() @{
	const selected = track<TabInfo['id']>(INITIAL_TAB);
	const selectedTab = track(() => TABS.find((tab) => tab.id === selected.value)!);
	const tabButtons: Partial<Record<TabInfo['id'], HTMLButtonElement>> = {};

	function selectAt(index: number) {
		const tab = TABS[(index + TABS.length) % TABS.length]!;
		selected.value = tab.id;
		tabButtons[tab.id]?.focus();
	}

	function onKeyDown(event: KeyboardEvent) {
		const index = TABS.findIndex((tab) => tab.id === selected.value);
		if (event.key === 'ArrowRight') selectAt(index + 1);
		else if (event.key === 'ArrowLeft') selectAt(index - 1);
		else if (event.key === 'Home') selectAt(0);
		else if (event.key === 'End') selectAt(TABS.length - 1);
		else return;
		event.preventDefault();
	}

	<div class="tabs">
		<div class="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
			@for (const tab of TABS; key tab.id) {
				<button
					type="button"
					class="tab"
					role="tab"
					id={`tab-${tab.id}`}
					data-testid={`tab-${tab.id}`}
					aria-controls="tab-panel"
					aria-selected={selected.value === tab.id ? 'true' : 'false'}
					tabindex={selected.value === tab.id ? 0 : -1}
					ref={(node: HTMLButtonElement) => {
						tabButtons[tab.id] = node;
					}}
					onClick={() => (selected.value = tab.id)}
					{onKeyDown}
				>
					{tab.label}
				</button>
			}
		</div>
		<div
			class="tabpanel"
			role="tabpanel"
			id="tab-panel"
			data-testid="tab-panel"
			aria-labelledby={`tab-${selectedTab.value.id}`}
			tabindex={0}
		>
			{selectedTab.value.content}
		</div>
	</div>
}

function Filter() @{
	const query = track('');
	const items = track(() => filterItems(FILTER_ITEMS, query.value));

	<section class="filter">
		<div class="field">
			<label class="field-label" for="filter-input">Filter items</label>
			<input
				class="input"
				type="search"
				id="filter-input"
				data-testid="filter-input"
				autocomplete="off"
				value={query.value}
				onInput={(event: Event) => (query.value = (event.target as HTMLInputElement).value)}
			/>
		</div>
		<p class="muted" data-testid="filter-count">{filterCountText(items.value.length)}</p>
		<ul class="list" data-testid="filter-list">
			@for (const item of items.value; key item) {
				<li data-testid="filter-item">{item}</li>
			}
		</ul>
		@if (items.value.length === 0) {
			<p class="muted" data-testid="filter-empty">No matching items</p>
		}
	</section>
}

export function Overview() {
	return <AppShell route="overview">
		<div class="prose">
			@for (const paragraph of OVERVIEW_PROSE; key paragraph) {
				<p>{paragraph}</p>
			}
		</div>
		<h2 class="section-title">Panels</h2>
		<div class="panels">
			<CounterPanel />
			<TogglePanel />
			<StepperPanel />
		</div>
		<Tabs />
		<Filter />
	</AppShell>;
}
