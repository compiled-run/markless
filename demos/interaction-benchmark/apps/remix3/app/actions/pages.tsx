import { routes } from '../routes.ts'
import { OVERVIEW_PROSE } from '../shared/data.ts'
import { Document } from './document.tsx'
import { Counter } from './public/counter.tsx'
import { Filter } from './public/filter.tsx'
import { RecordsTable } from './public/records-table.tsx'
import { SettingsForm } from './public/settings-form.tsx'
import { Stepper } from './public/stepper.tsx'
import { Tabs } from './public/tabs.tsx'
import { Toggle } from './public/toggle.tsx'

export function OverviewPage() {
  return () => (
    <Document route="overview">
      <div className="prose">
        {OVERVIEW_PROSE.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <h2 className="section-title">Panels</h2>
      <div className="panels">
        <section className="panel">
          <h3 className="panel-title">Counter</h3>
          <Counter />
        </section>
        <section className="panel">
          <h3 className="panel-title">Toggle</h3>
          <Toggle />
        </section>
        <section className="panel">
          <h3 className="panel-title">Stepper</h3>
          <Stepper />
        </section>
      </div>
      <div className="tabs">
        <Tabs />
      </div>
      <section className="filter">
        <Filter />
      </section>
    </Document>
  )
}

export function RecordsPage() {
  return () => (
    <Document route="records">
      <RecordsTable />
    </Document>
  )
}

export function SettingsPage() {
  return () => (
    <Document route="settings">
      <SettingsForm action={routes.settingsApi.href()} />
    </Document>
  )
}
