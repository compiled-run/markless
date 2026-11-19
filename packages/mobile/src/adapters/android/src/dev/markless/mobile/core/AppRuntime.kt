package dev.markless.mobile.core

/** One screen of the stack: its route, the path it opened at and its page's runtime. */
class Screen(val route: String, val params: Map<String, String>, val path: String, val runtime: Runtime)

/** The stack an app's screens form, without views: what each host's real stack must match. Free of android.*. */
class AppRuntime(val app: AppPayload, path: String, private val store: Store = MemoryStore(), private val scriptHost: ScriptHost? = null) {
	val screens: MutableList<Screen> = app.backStack(path).map { open(app.match(it)!!.first.route.pattern, app.match(it)!!.second) }.toMutableList()

	/** What starting the screens the app opened with asked for, bottom first (their async values' requests and timers). */
	val started: List<JournalEntry> = screens.flatMap { it.runtime.start() }

	fun open(route: String, params: Map<String, String>): Screen =
		Screen(route, params, AppPayload.path(route, params), Runtime(app.page(route).page, store, params, scriptHost = scriptHost))

	/** Runs an action on the top screen; a `navigate` entry pushes the new screen, or replaces the top one, which leaves; the new one starts. */
	fun dispatch(host: String, event: EventName, value: String? = null): List<JournalEntry> {
		val journal = screens.last().runtime.dispatch(host, event, value)
		val last = journal.lastOrNull()
		if (last is JournalEntry.Navigate) {
			val next = open(last.route, last.params)
			val left = if (last.replace) screens.removeAt(screens.size - 1).runtime.leave() else emptyList()
			screens.add(next)
			return journal + left + next.runtime.start()
		}
		return journal
	}

	/** Pops the top screen; the one below is shown as it was left; the journal is the popped screen's [Runtime.leave]. */
	fun back(): List<JournalEntry> {
		if (screens.size < 2) throw MarklessRuntimeError("back on the first screen leaves the app")
		return screens.removeAt(screens.size - 1).runtime.leave()
	}
}
