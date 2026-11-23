package dev.markless.mobile.view

import android.os.Handler
import android.os.Looper
import android.util.Log
import dev.markless.mobile.core.FetchBody
import dev.markless.mobile.core.FetchRequest
import dev.markless.mobile.core.FormPart
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.ScriptEngine
import dev.markless.mobile.core.ScriptHost
import java.lang.reflect.InvocationTargetException
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.Locale
import java.util.UUID

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

/** The requests one screen's script sent: each is sent on its own thread and answered on the main thread, unless aborted first. */
internal class ScriptServices(private val context: android.content.Context) {
	private val main = Handler(Looper.getMainLooper())
	private var stopped = false
	private val inFlight = HashMap<Int, Request>()

	private class Request {
		@Volatile var connection: HttpURLConnection? = null
		@Volatile var cancelled = false

		fun cancel() {
			cancelled = true
			connection?.let { runCatching { it.disconnect() } }
		}
	}

	fun fetch(id: Int, request: FetchRequest, answered: (JsValue) -> Unit) {
		val call = Request()
		inFlight[id] = call
		Thread {
			val response = send(request, call)
			main.post { if (inFlight[id] === call) inFlight.remove(id); if (!stopped && !call.cancelled) answered(response) }
		}.start()
	}

	/** The script aborted request [id]: it is cancelled and its answer, if one still arrives, is dropped. */
	fun abort(id: Int) {
		inFlight.remove(id)?.cancel()
	}

	/** The screen is gone: every request is cancelled and no answer lands after this. */
	fun stop() {
		stopped = true
		for (call in inFlight.values) call.cancel()
		inFlight.clear()
	}

	/**
	 * A FormData as a browser sends it: each entry a part, a file's with its filename, its type and its bytes, read from the
	 * file the picker chose (by its URI, the reference the host gave it) or from the text it was made of.
	 */
	private fun multipart(parts: List<FormPart>, boundary: String): ByteArray {
		val out = java.io.ByteArrayOutputStream()
		val quoted = { text: String -> text.replace("\"", "%22").replace("\r", "%0D").replace("\n", "%0A") }
		val write = { text: String -> out.write(text.toByteArray(Charsets.UTF_8)) }
		for (part in parts) {
			write("--$boundary\r\nContent-Disposition: form-data; name=\"${quoted(part.name)}\"")
			val file = part.file
			if (file == null) write("\r\n\r\n${part.text}\r\n")
			else {
				write("; filename=\"${quoted(file.name)}\"\r\nContent-Type: ${file.type.ifEmpty { "application/octet-stream" }}\r\n\r\n")
				if (file.ref != null) context.contentResolver.openInputStream(android.net.Uri.parse(file.ref))!!.use { it.copyTo(out) }
				else write(file.text.orEmpty())
				write("\r\n")
			}
		}
		write("--$boundary--\r\n")
		return out.toByteArray()
	}

	private fun send(request: FetchRequest, call: Request): JsValue = try {
		val connection = URL(request.url).openConnection() as HttpURLConnection
		call.connection = connection
		if (call.cancelled) connection.disconnect()
		try {
			connection.requestMethod = request.method
			for ((name, value) in request.headers) connection.addRequestProperty(name, value)
			when (val body = request.body) {
				is FetchBody.Text -> {
					connection.doOutput = true
					connection.outputStream.use { it.write(body.text.toByteArray(Charsets.UTF_8)) }
				}
				is FetchBody.Form -> {
					val boundary = "MarklessBoundary" + UUID.randomUUID().toString().replace("-", "")
					if (request.headers.none { it.first.equals("content-type", ignoreCase = true) })
						connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
					val bytes = multipart(body.parts, boundary)
					connection.doOutput = true
					connection.outputStream.use { it.write(bytes) }
				}
				null -> {}
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
