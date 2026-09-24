import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  COUNTER_INITIAL,
  documentTitle,
  FILTER_ITEMS,
  filterCountText,
  filterItems,
  INITIAL_TAB,
  OVERVIEW_PROSE,
  ROUTES,
  STEPPER_INITIAL,
  STEPPER_MAX,
  STEPPER_MIN,
  stepperDerivedText,
  TABS,
  type TabInfo,
  toggleStatusText,
} from "../shared/data";

export default function Overview() {
  return (
    <>
      <Title>{documentTitle(ROUTES[0]!)}</Title>
      <h1 class="page-title" data-testid="page-title">Overview</h1>
      <div class="prose">
        <For each={OVERVIEW_PROSE}>{(text) => <p>{text}</p>}</For>
      </div>
      <h2 class="section-title">Panels</h2>
      <div class="panels">
        <CounterPanel />
        <TogglePanel />
        <StepperPanel />
      </div>
      <Tabs />
      <Filter />
    </>
  );
}

function CounterPanel() {
  const [count, setCount] = createSignal(COUNTER_INITIAL);
  return (
    <section class="panel">
      <h3 class="panel-title">Counter</h3>
      <output class="value" data-testid="counter-value">{count()}</output>
      <button type="button" class="button" data-testid="counter-increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </section>
  );
}

function TogglePanel() {
  const [on, setOn] = createSignal(false);
  return (
    <section class="panel">
      <h3 class="panel-title">Toggle</h3>
      <button
        type="button"
        class="button"
        data-testid="toggle-button"
        aria-pressed={on() ? "true" : "false"}
        onClick={() => setOn((v) => !v)}
      >
        Notifications
      </button>
      <output class="value" data-testid="toggle-status">{toggleStatusText(on())}</output>
    </section>
  );
}

function StepperPanel() {
  const [value, setValue] = createSignal(STEPPER_INITIAL);
  return (
    <section class="panel">
      <h3 class="panel-title">Stepper</h3>
      <div class="row">
        <button
          type="button"
          class="button"
          data-testid="stepper-decrement"
          aria-label="Decrease"
          disabled={value() <= STEPPER_MIN}
          onClick={() => setValue((v) => Math.max(STEPPER_MIN, v - 1))}
        >
          {"−"}
        </button>
        <output class="value" data-testid="stepper-value">{value()}</output>
        <button
          type="button"
          class="button"
          data-testid="stepper-increment"
          aria-label="Increase"
          disabled={value() >= STEPPER_MAX}
          onClick={() => setValue((v) => Math.min(STEPPER_MAX, v + 1))}
        >
          +
        </button>
      </div>
      <p class="derived" data-testid="stepper-derived">{stepperDerivedText(value())}</p>
    </section>
  );
}

function Tabs() {
  const [selected, setSelected] = createSignal<TabInfo["id"]>(INITIAL_TAB);
  const current = createMemo(() => TABS.find((tab) => tab.id === selected())!);
  const buttons: HTMLButtonElement[] = [];

  const selectAt = (index: number) => {
    const tab = TABS[(index + TABS.length) % TABS.length]!;
    setSelected(tab.id);
    buttons[TABS.indexOf(tab)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight") selectAt(index + 1);
    else if (event.key === "ArrowLeft") selectAt(index - 1);
    else if (event.key === "Home") selectAt(0);
    else if (event.key === "End") selectAt(TABS.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div class="tabs">
      <div class="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
        <For each={TABS}>
          {(tab, index) => (
            <button
              ref={(el) => (buttons[index()] = el)}
              type="button"
              class="tab"
              role="tab"
              id={`tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              aria-controls="tab-panel"
              aria-selected={selected() === tab.id ? "true" : "false"}
              tabindex={selected() === tab.id ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index())}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <div
        class="tabpanel"
        role="tabpanel"
        id="tab-panel"
        data-testid="tab-panel"
        aria-labelledby={`tab-${current().id}`}
        tabindex="0"
      >
        {current().content}
      </div>
    </div>
  );
}

function Filter() {
  const [query, setQuery] = createSignal("");
  const items = createMemo(() => filterItems(FILTER_ITEMS, query()));
  return (
    <section class="filter">
      <div class="field">
        <label class="field-label" for="filter-input">Filter items</label>
        <input
          id="filter-input"
          class="input"
          type="search"
          data-testid="filter-input"
          autocomplete="off"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <p class="muted" data-testid="filter-count">{filterCountText(items().length)}</p>
      <Show when={items().length > 0} fallback={<p class="muted" data-testid="filter-empty">No matching items</p>}>
        <ul class="list" data-testid="filter-list">
          <For each={items()}>{(item) => <li data-testid="filter-item">{item}</li>}</For>
        </ul>
      </Show>
    </section>
  );
}
