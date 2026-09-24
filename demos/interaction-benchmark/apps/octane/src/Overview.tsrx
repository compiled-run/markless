import { useRef, useState } from 'octane';
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
} from './shared/data.ts';
import type { TabInfo } from './shared/data.ts';

function CounterPanel() @{
	const [count, setCount] = useState(COUNTER_INITIAL);

	<section class="panel">
		<h3 class="panel-title">{'Counter'}</h3>
		<output class="value" data-testid="counter-value">{count}</output>
		<button class="button" type="button" data-testid="counter-increment" onClick={() => setCount((value) => value + 1)}>
			{'Increment'}
		</button>
	</section>
}

function TogglePanel() @{
	const [on, setOn] = useState(false);

	<section class="panel">
		<h3 class="panel-title">{'Toggle'}</h3>
		<button
			class="button"
			type="button"
			data-testid="toggle-button"
			aria-pressed={on ? 'true' : 'false'}
			onClick={() => setOn((value) => !value)}
		>
			{'Notifications'}
		</button>
		<output class="value" data-testid="toggle-status">{toggleStatusText(on)}</output>
	</section>
}

function StepperPanel() @{
	const [value, setValue] = useState(STEPPER_INITIAL);

	<section class="panel">
		<h3 class="panel-title">{'Stepper'}</h3>
		<div class="row">
			<button
				class="button"
				type="button"
				data-testid="stepper-decrement"
				aria-label="Decrease"
				disabled={value <= STEPPER_MIN}
				onClick={() => setValue((current) => Math.max(STEPPER_MIN, current - 1))}
			>
				{'−'}
			</button>
			<output class="value" data-testid="stepper-value">{value}</output>
			<button
				class="button"
				type="button"
				data-testid="stepper-increment"
				aria-label="Increase"
				disabled={value >= STEPPER_MAX}
				onClick={() => setValue((current) => Math.min(STEPPER_MAX, current + 1))}
			>
				{'+'}
			</button>
		</div>
		<p class="derived" data-testid="stepper-derived">{stepperDerivedText(value)}</p>
	</section>
}

function Tabs() @{
	const [selected, setSelected] = useState<TabInfo['id']>(INITIAL_TAB);
	const tabButtons = useRef(new Map<string, HTMLButtonElement>());
	const selectedTab = TABS.find((tab) => tab.id === selected) ?? TABS[0];

	const selectAndFocus = (index: number) => {
		const tab = TABS[(index + TABS.length) % TABS.length];
		setSelected(tab.id);
		tabButtons.current.get(tab.id)?.focus();
	};

	const onKeyDown = (event: KeyboardEvent, index: number) => {
		if (event.key === 'ArrowRight') selectAndFocus(index + 1);
		else if (event.key === 'ArrowLeft') selectAndFocus(index - 1);
		else if (event.key === 'Home') selectAndFocus(0);
		else if (event.key === 'End') selectAndFocus(TABS.length - 1);
		else return;
		event.preventDefault();
	};

	<div class="tabs">
		<div class="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
			@for (const tab of TABS; index i; key tab.id) {
				<button
					class="tab"
					type="button"
					role="tab"
					id={'tab-' + tab.id}
					data-testid={'tab-' + tab.id}
					aria-controls="tab-panel"
					aria-selected={tab.id === selected ? 'true' : 'false'}
					tabIndex={tab.id === selected ? 0 : -1}
					ref={(element: HTMLButtonElement | null) => {
						if (element) tabButtons.current.set(tab.id, element);
						else tabButtons.current.delete(tab.id);
					}}
					onClick={() => setSelected(tab.id)}
					onKeyDown={(event: KeyboardEvent) => onKeyDown(event, i)}
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
			aria-labelledby={'tab-' + selected}
			tabIndex={0}
		>
			{selectedTab.content}
		</div>
	</div>
}

function Filter() @{
	const [query, setQuery] = useState('');
	const items = filterItems(FILTER_ITEMS, query);

	<section class="filter">
		<div class="field">
			<label class="field-label" for="filter-input">{'Filter items'}</label>
			<input
				class="input"
				id="filter-input"
				type="search"
				data-testid="filter-input"
				autocomplete="off"
				value={query}
				onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
			/>
		</div>
		<p class="muted" data-testid="filter-count">{filterCountText(items.length)}</p>
		<ul class="list" data-testid="filter-list">
			@for (const item of items; key item) {
				<li data-testid="filter-item">{item}</li>
			}
		</ul>
		@if (items.length === 0) {
			<p class="muted" data-testid="filter-empty">{'No matching items'}</p>
		}
	</section>
}

export function Overview() @{
	<>
		<div class="prose">
			@for (const paragraph of OVERVIEW_PROSE; key paragraph) {
				<p>{paragraph}</p>
			}
		</div>
		<h2 class="section-title">{'Panels'}</h2>
		<div class="panels">
			<CounterPanel />
			<TogglePanel />
			<StepperPanel />
		</div>
		<Tabs />
		<Filter />
	</>
}
