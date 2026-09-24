import { useRef, useState, type KeyboardEvent } from "react";
import {
  COUNTER_INITIAL,
  FILTER_ITEMS,
  INITIAL_TAB,
  OVERVIEW_PROSE,
  ROUTES,
  STEPPER_INITIAL,
  STEPPER_MAX,
  STEPPER_MIN,
  TABS,
  documentTitle,
  filterCountText,
  filterItems,
  stepperDerivedText,
  toggleStatusText,
  type TabInfo,
} from "../shared/data";

export function meta() {
  return [{ title: documentTitle(ROUTES[0]!) }];
}

function CounterPanel() {
  const [count, setCount] = useState(COUNTER_INITIAL);
  return (
    <section className="panel">
      <h3 className="panel-title">Counter</h3>
      <output className="value" data-testid="counter-value">
        {count}
      </output>
      <button
        type="button"
        className="button"
        data-testid="counter-increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </section>
  );
}

function TogglePanel() {
  const [on, setOn] = useState(false);
  return (
    <section className="panel">
      <h3 className="panel-title">Toggle</h3>
      <button
        type="button"
        className="button"
        data-testid="toggle-button"
        aria-pressed={on}
        onClick={() => setOn((v) => !v)}
      >
        Notifications
      </button>
      <output className="value" data-testid="toggle-status">
        {toggleStatusText(on)}
      </output>
    </section>
  );
}

function StepperPanel() {
  const [value, setValue] = useState(STEPPER_INITIAL);
  return (
    <section className="panel">
      <h3 className="panel-title">Stepper</h3>
      <div className="row">
        <button
          type="button"
          className="button"
          data-testid="stepper-decrement"
          aria-label="Decrease"
          disabled={value <= STEPPER_MIN}
          onClick={() => setValue((v) => Math.max(STEPPER_MIN, v - 1))}
        >
          {"−"}
        </button>
        <output className="value" data-testid="stepper-value">
          {value}
        </output>
        <button
          type="button"
          className="button"
          data-testid="stepper-increment"
          aria-label="Increase"
          disabled={value >= STEPPER_MAX}
          onClick={() => setValue((v) => Math.min(STEPPER_MAX, v + 1))}
        >
          +
        </button>
      </div>
      <p className="derived" data-testid="stepper-derived">
        {stepperDerivedText(value)}
      </p>
    </section>
  );
}

function Tabs() {
  const [selected, setSelected] = useState<TabInfo["id"]>(INITIAL_TAB);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = TABS.find((t) => t.id === selected)!;

  function select(index: number) {
    setSelected(TABS[index]!.id);
    tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    let next: number;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    select(next);
  }

  return (
    <div className="tabs">
      <div className="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
        {TABS.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              className="tab"
              id={`tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              aria-controls="tab-panel"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        className="tabpanel"
        role="tabpanel"
        id="tab-panel"
        data-testid="tab-panel"
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
      >
        {current.content}
      </div>
    </div>
  );
}

function Filter() {
  const [query, setQuery] = useState("");
  const items = filterItems(FILTER_ITEMS, query);
  return (
    <section className="filter">
      <div className="field">
        <label className="field-label" htmlFor="filter-input">
          Filter items
        </label>
        <input
          className="input"
          id="filter-input"
          type="search"
          data-testid="filter-input"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <p className="muted" data-testid="filter-count">
        {filterCountText(items.length)}
      </p>
      {items.length === 0 ? (
        <p className="muted" data-testid="filter-empty">
          No matching items
        </p>
      ) : (
        <ul className="list" data-testid="filter-list">
          {items.map((item) => (
            <li key={item} data-testid="filter-item">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Overview() {
  return (
    <>
      <h1 className="page-title" data-testid="page-title">
        Overview
      </h1>
      <div className="prose">
        {OVERVIEW_PROSE.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
      <h2 className="section-title">Panels</h2>
      <div className="panels">
        <CounterPanel />
        <TogglePanel />
        <StepperPanel />
      </div>
      <Tabs />
      <Filter />
    </>
  );
}
