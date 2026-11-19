package dev.markless.mobile.core

/** One screen of the stack: its route, the path it opened at and its page's runtime. */
class Screen(val route: String, val params: Map<String, String>, val path: String, val runtime: Runtime)

/** The stack an app's screens form, without views: what each host's real stack must match. Free of android.*. */
class AppRuntime(val app: AppPayload, path: String, private val store: Store = MemoryStore(), private val scriptHost: ScriptHost? = null) {
	val screens: MutableList<Screen> = app.backStack(path).map { open(app.match(it)!!.first.route.pattern, app.match(it)!!.second) }.toMutableList()

	fun open(route: String, params: Map<String, String>): Screen =
		Screen(route, params, AppPayload.path(route, params), Runtime(app.page(route).page, store, params, scriptHost = scriptHost))

	/** Runs an action on the top screen; a `navigate` entry pushes the new screen, or replaces the top one. */
	fun dispatch(host: String, event: EventName, value: String? = null): List<JournalEntry> {
		val journal = screens.last().runtime.dispatch(host, event, value)
		val last = journal.lastOrNull()
		if (last is JournalEntry.Navigate) {
			val next = open(last.route, last.params)
			if (last.replace) screens.removeAt(screens.size - 1)
			screens.add(next)
		}
		return journal
	}

	/** Pops the top screen; the one below is shown as it was left, and nothing is journalled. */
	fun back(): List<JournalEntry> {
		if (screens.size < 2) throw MarklessRuntimeError("back on the first screen leaves the app")
		screens.removeAt(screens.size - 1)
		return emptyList()
	}
}
