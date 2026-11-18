package dev.markless.mobile.view

import android.os.Handler
import android.os.Looper
import android.util.Log
import dev.markless.mobile.core.FetchRequest
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.ScriptEngine
import dev.markless.mobile.core.ScriptHost
import java.lang.reflect.InvocationTargetException
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.Locale

/**
 * The app process's one JavaScript engine, shared by every screen and started the first time one needs it. The engine
 * class ships only in an APK whose payloads have a script; the host finds it by name and builds and runs without it.
 * Main thread only.
 */
object AppScriptEngine : ScriptHost {
	const val ENGINE_CLASS = "dev.markless.mobile.engine.HermesEngine"
	const val TAG = "MarklessScript"

	private var engine: ScriptEngine? = null
	private val random = SecureRandom()
	private val listeners = LinkedHashSet<(Int) -> Unit>()
	/** Whether the engine started inside the entry now running, rather than ahead of it. */
	private var startedInEntry = false
	private var firstEntryLogged = false

	/** How many times this process started the engine: 0 or 1. */
	var starts = 0
		private set

	/** Whether this app was built with the engine. */
	val available: Boolean by lazy {
		try {
			Class.forName(ENGINE_CLASS, false, AppScriptEngine::class.java.classLoader)
			true
		} catch (_: ClassNotFoundException) {
			false
		}
	}

	fun onStart(listener: (Int) -> Unit) { listeners.add(listener) }

	fun removeOnStart(listener: (Int) -> Unit) { listeners.remove(listener) }

	override fun start(): ScriptEngine = engine ?: create()

	private fun create(): ScriptEngine {
		val type = try {
			Class.forName(ENGINE_CLASS)
		} catch (_: ClassNotFoundException) {
			throw MarklessHostError("this payload runs JavaScript and the app was built without the engine ($ENGINE_CLASS)")
		}
		val started = System.nanoTime()
		val instance = type.getConstructor().newInstance()
		val evaluate = type.getMethod("evaluate", String::class.java)
		Log.i(TAG, "engine start ${millis(System.nanoTime() - started)} ms")
		val created = object : ScriptEngine {
			override fun evaluate(source: String): String = try {
				evaluate.invoke(instance, source) as String
			} catch (e: InvocationTargetException) {
				throw e.targetException
			}
		}
		engine = created
		starts++
		startedInEntry = true
		for (listener in listeners.toList()) listener(starts)
		return created
	}

	override fun seed(): String = ByteArray(32).also(random::nextBytes).joinToString("") { "%02x".format(it) }

	/** Starts the engine and loads [runtime]'s script before any entry needs it. */
	fun warm(runtime: Runtime) {
		val started = System.nanoTime()
		if (!runtime.warm()) return
		startedInEntry = false
		Log.i(TAG, "engine warm ${millis(System.nanoTime() - started)} ms")
	}

	fun entryRan(nanos: Long) {
		if (firstEntryLogged) return
		firstEntryLogged = true
		Log.i(TAG, "first script entry ${millis(nanos)} ms (engine ${if (startedInEntry) "cold" else "warm"})")
	}

	private fun millis(nanos: Long) = String.format(Locale.ROOT, "%.1f", nanos / 1e6)
}

/** The requests one screen's script sent: each is sent on its own thread and answered on the main thread. */
internal class ScriptServices {
	private val main = Handler(Looper.getMainLooper())
	private var stopped = false

	fun fetch(request: FetchRequest, answered: (JsValue) -> Unit) {
		Thread {
			val response = send(request)
			main.post { if (!stopped) answered(response) }
		}.start()
	}

	/** The screen is gone: no answer lands after this. */
	fun stop() {
		stopped = true
	}

	private fun send(request: FetchRequest): JsValue = try {
		val connection = URL(request.url).openConnection() as HttpURLConnection
		try {
			connection.requestMethod = request.method
			for ((name, value) in request.headers) connection.addRequestProperty(name, value)
			request.body?.let { body ->
				connection.doOutput = true
				connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
			}
			val status = connection.responseCode
			val body = (if (status >= 400) connection.errorStream else connection.inputStream)?.use { String(it.readBytes(), Charsets.UTF_8) } ?: ""
			val headers = connection.headerFields.entries.filter { it.key != null }.flatMap { (name, values) -> values.map { JsValue.Arr(mutableListOf(JsValue.Str(name.lowercase(Locale.ROOT)), JsValue.Str(it))) } }
			JsValue.Obj(linkedMapOf(
				"status" to JsValue.Num(status.toDouble()),
				"statusText" to JsValue.Str(connection.responseMessage ?: ""),
				"headers" to JsValue.Arr(headers.toMutableList()),
				"body" to JsValue.Str(body),
			))
		} finally {
			connection.disconnect()
		}
	} catch (e: Exception) {
		JsValue.Obj(linkedMapOf("error" to JsValue.Str(e.message ?: e.toString())))
	}
}
