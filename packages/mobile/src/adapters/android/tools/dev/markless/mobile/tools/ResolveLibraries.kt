package dev.markless.mobile.tools

import dev.markless.mobile.core.Json
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.system.exitProcess
import org.w3c.dom.Element

const val LOCK_VERSION = "markless.android-libraries/0"
val REPOSITORIES = listOf("https://dl.google.com/dl/android/maven2", "https://repo1.maven.org/maven2")

/** Modules the Kotlin toolchain's own stdlib stands in for: listed in the lock, never downloaded or dexed. */
val TOOLCHAIN = setOf("org.jetbrains.kotlin:kotlin-stdlib", "org.jetbrains.kotlin:kotlin-stdlib-jdk7", "org.jetbrains.kotlin:kotlin-stdlib-jdk8", "org.jetbrains.kotlin:kotlin-stdlib-common")

/** [platform]: asked for as a platform (a BOM), whose managed versions become constraints. */
data class Request(val module: String, val version: String, val platform: Boolean = false)

/** One module version's runtime facts: its dependencies, its version constraints, the file it ships, or the module it moved to; [managed] is a POM's dependencyManagement. */
data class Metadata(val dependencies: List<Request>, val constraints: List<Request>, val file: String?, val movedTo: Request?, val repository: String, val managed: List<Request> = emptyList())

private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build()
private val fetched = HashMap<String, ByteArray?>()

fun fetch(url: String): ByteArray? = fetched.getOrPut(url) {
	val response = http.send(HttpRequest.newBuilder(URI(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())
	when (response.statusCode()) {
		200 -> response.body()
		404 -> null
		else -> throw IllegalStateException("GET $url: ${response.statusCode()}")
	}
}

fun path(module: String, version: String, extension: String): String {
	val (group, name) = module.split(':')
	return "${group.replace('.', '/')}/$name/$version/$name-$version.$extension"
}

/** Gradle's ordering, enough for release versions: numeric parts numerically, a qualified version before its release. */
fun compareVersions(a: String, b: String): Int {
	fun parts(v: String) = v.split('.', '-', '_')
	val pa = parts(a); val pb = parts(b)
	for (i in 0 until maxOf(pa.size, pb.size)) {
		val x = pa.getOrNull(i); val y = pb.getOrNull(i)
		if (x == null) return if (y!!.toIntOrNull() != null) -1 else 1
		if (y == null) return if (x.toIntOrNull() != null) 1 else -1
		val nx = x.toIntOrNull(); val ny = y.toIntOrNull()
		val c = when {
			nx != null && ny != null -> nx.compareTo(ny)
			nx != null -> 1
			ny != null -> -1
			else -> x.compareTo(y)
		}
		if (c != 0) return c
	}
	return 0
}

fun requested(v: Json, what: String): String {
	val o = v.obj(what)
	return (o["strictly"] ?: o["requires"] ?: o["prefers"] ?: throw IllegalStateException("$what names no version")).str(what)
}

/** The runtime variant of a Gradle module: a library (or a platform) for the JVM, Android's when there are several. */
fun fromModule(bytes: ByteArray, module: String, version: String, repository: String): Metadata {
	val root = Json.parse(bytes).obj("$module:$version.module")
	val variants = root["variants"]!!.arr("variants").map { it.obj("variant") }
	fun attr(v: Map<String, Json>, name: String) = v["attributes"]?.obj("attributes")?.get(name)?.let { (it as? Json.Str)?.value }
	val runtime = variants.filter { attr(it, "org.gradle.usage") == "java-runtime" && attr(it, "org.gradle.category") in setOf("library", "platform") }
		.filter { attr(it, "org.jetbrains.kotlin.platform.type") in setOf(null, "jvm", "androidJvm") }
	fun rank(v: Map<String, Json>) = listOf(
		if (attr(v, "org.gradle.category") == "library") 0 else 1,
		when (attr(v, "org.jetbrains.kotlin.platform.type")) { "androidJvm" -> 0; null -> 1; else -> 2 },
		if (attr(v, "org.gradle.jvm.environment") == "android") 0 else 1,
	)
	val chosen = runtime.minWithOrNull { a, b -> rank(a).zip(rank(b)).map { (x, y) -> x.compareTo(y) }.firstOrNull { it != 0 } ?: 0 }
		?: throw IllegalStateException("$module:$version has no JVM runtime variant (${variants.map { it["name"] }})")
	chosen["available-at"]?.obj("available-at")?.let { a ->
		return Metadata(emptyList(), emptyList(), null, Request("${a["group"]!!.str("group")}:${a["module"]!!.str("module")}", a["version"]!!.str("version")), repository)
	}
	fun requests(key: String) = chosen[key]?.arr(key).orEmpty().map { d ->
		val o = d.obj(key)
		val platform = o["attributes"]?.obj("attributes")?.get("org.gradle.category") == Json.Str("platform")
		Request("${o["group"]!!.str("group")}:${o["module"]!!.str("module")}", requested(o["version"] ?: throw IllegalStateException("$module:$version: a dependency with no version"), "version"), platform)
	}
	val files = chosen["files"]?.arr("files").orEmpty().map { it.obj("file")["url"]!!.str("url") }.filter { it.endsWith(".aar") || it.endsWith(".jar") }
	if (files.size > 1) throw IllegalStateException("$module:$version ships ${files.size} runtime files: $files")
	val file = files.firstOrNull()?.let { "$repository/${path(module, version, "pom").substringBeforeLast('/')}/$it" }
	return Metadata(requests("dependencies"), requests("dependencyConstraints"), file, null, repository)
}

fun Element.child(name: String): Element? = (0 until childNodes.length).map { childNodes.item(it) }.filterIsInstance<Element>().firstOrNull { it.tagName == name }
fun Element.children(name: String): List<Element> = (0 until childNodes.length).map { childNodes.item(it) }.filterIsInstance<Element>().filter { it.tagName == name }

fun xml(bytes: ByteArray): Element = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = false }.newDocumentBuilder().parse(ByteArrayInputStream(bytes)).documentElement

/** A POM and its parents, outermost last: the properties, managed versions and dependencies Maven's inheritance gives the module. */
class Pom(val project: Element, val parent: Pom?) {
	fun text(e: Element?, name: String) = e?.child(name)?.textContent?.trim()

	val properties: Map<String, String> = HashMap<String, String>().apply {
		parent?.let { putAll(it.properties) }
		project.child("properties")?.let { props -> for (i in 0 until props.childNodes.length) (props.childNodes.item(i) as? Element)?.let { put(it.tagName, it.textContent.trim()) } }
		val version = text(project, "version") ?: text(project.child("parent"), "version")
		val group = text(project, "groupId") ?: text(project.child("parent"), "groupId")
		version?.let { put("project.version", it); put("version", it) }
		group?.let { put("project.groupId", it) }
	}

	/** Maven's `${name}` interpolation over this POM's properties. */
	fun interpolate(value: String, depth: Int = 0): String {
		if (depth > 8) throw IllegalStateException("properties nest deeper than 8 in \"$value\"")
		val out = StringBuilder()
		var at = 0
		while (true) {
			val open = value.indexOf("\${", at)
			if (open < 0) return out.append(value, at, value.length).toString()
			val close = value.indexOf('}', open)
			val name = value.substring(open + 2, close)
			out.append(value, at, open).append(interpolate(properties[name] ?: throw IllegalStateException("property \"$name\" is not defined"), depth + 1))
			at = close + 1
		}
	}

	val managed: Map<String, String> = HashMap<String, String>().apply {
		parent?.let { putAll(it.managed) }
		for (d in project.child("dependencyManagement")?.child("dependencies")?.children("dependency").orEmpty()) {
			if (text(d, "scope") == "import") throw IllegalStateException("an imported BOM in dependencyManagement is not read by this resolver")
			put("${interpolate(text(d, "groupId")!!)}:${interpolate(text(d, "artifactId")!!)}", interpolate(text(d, "version")!!))
		}
	}

	val dependencies: List<Element> get() = parent?.dependencies.orEmpty() + project.child("dependencies")?.children("dependency").orEmpty()
}

fun pom(bytes: ByteArray, repository: String): Pom {
	val project = xml(bytes)
	val parent = project.child("parent")?.let { p ->
		val module = "${p.child("groupId")!!.textContent.trim()}:${p.child("artifactId")!!.textContent.trim()}"
		val version = p.child("version")!!.textContent.trim()
		pom(fetch("$repository/${path(module, version, "pom")}") ?: throw IllegalStateException("parent POM $module:$version is missing"), repository)
	}
	return Pom(project, parent)
}

/** A POM's compile and runtime dependencies, for a module with no Gradle metadata. */
fun fromPom(bytes: ByteArray, module: String, version: String, repository: String): Metadata {
	val p = pom(bytes, repository)
	val packaging = p.text(p.project, "packaging") ?: "jar"
	val dependencies = p.dependencies.mapNotNull { d ->
		val scope = p.text(d, "scope") ?: "compile"
		if (scope !in setOf("compile", "runtime") || p.text(d, "optional") == "true") return@mapNotNull null
		val coordinate = "${p.interpolate(p.text(d, "groupId")!!)}:${p.interpolate(p.text(d, "artifactId")!!)}"
		val v = p.text(d, "version")?.let(p::interpolate) ?: p.managed[coordinate] ?: throw IllegalStateException("$module:$version: $coordinate has no version")
		if (v.startsWith("[") || v.startsWith("(")) throw IllegalStateException("$module:$version: dependency version \"$v\" is a range")
		Request(coordinate, v)
	}
	val extension = when (packaging) { "aar" -> "aar"; "jar", "bundle" -> "jar"; "pom" -> null; else -> throw IllegalStateException("$module:$version is packaged as $packaging") }
	return Metadata(dependencies, emptyList(), extension?.let { "$repository/${path(module, version, it)}" }, null, repository, p.managed.map { (m, v) -> Request(m, v) })
}

private val metadata = HashMap<Request, Metadata>()

fun metadataOf(r: Request): Metadata = metadata.getOrPut(r.copy(platform = false)) {
	for (repo in REPOSITORIES) {
		fetch("$repo/${path(r.module, r.version, "module")}")?.let { return@getOrPut fromModule(it, r.module, r.version, repo) }
		fetch("$repo/${path(r.module, r.version, "pom")}")?.let { return@getOrPut fromPom(it, r.module, r.version, repo) }
	}
	throw IllegalStateException("${r.module}:${r.version} is in none of $REPOSITORIES")
}

/**
 * Gradle-style resolution: each module takes the highest version any reached module asks for (dependencies and the
 * constraints of reached modules alike), repeated until nothing rises; the artifacts are the modules reached at those versions.
 */
fun resolve(roots: List<Request>): List<Pair<Request, Metadata>> {
	val chosen = HashMap<String, String>()
	fun raise(r: Request): Boolean {
		val now = chosen[r.module]
		if (now != null && compareVersions(now, r.version) >= 0) return false
		chosen[r.module] = r.version
		return true
	}
	for (r in roots) raise(r)
	while (true) {
		var rose = false
		val reached = LinkedHashSet<String>()
		val constraints = ArrayList<Request>()
		fun visit(module: String) {
			if (!reached.add(module) || module in TOOLCHAIN) return
			val m = metadataOf(Request(module, chosen.getValue(module)))
			val next = listOfNotNull(m.movedTo) + m.dependencies
			for (d in next) if (raise(d)) rose = true
			constraints.addAll(m.constraints)
			for (d in next) if (d.platform) constraints.addAll(metadataOf(Request(d.module, chosen.getValue(d.module))).managed)
			for (d in next) visit(d.module)
		}
		for (r in roots) visit(r.module)
		for (c in constraints) if (c.module in reached && raise(c)) rose = true
		if (!rose) break
	}
	val order = ArrayList<Pair<Request, Metadata>>()
	val done = HashSet<String>()
	fun post(module: String) {
		if (!done.add(module)) return
		val r = Request(module, chosen.getValue(module))
		if (module in TOOLCHAIN) { order.add(r to Metadata(emptyList(), emptyList(), "${REPOSITORIES[1]}/${path(module, r.version, "jar")}", null, REPOSITORIES[1])); return }
		val m = metadataOf(r)
		for (d in listOfNotNull(m.movedTo) + m.dependencies) post(d.module)
		order.add(r to m)
	}
	for (r in roots) post(r.module)
	return order.filter { it.second.file != null }
}

fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

/** The R package an AAR's code reads its resources from (its manifest's `package`), whether it has resources, and whether its R class has any symbols. */
fun aarFacts(bytes: ByteArray, what: String): Triple<String, Boolean, Boolean> {
	var manifest: ByteArray? = null
	var res = false
	var symbols = false
	ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
		while (true) {
			val e = zip.nextEntry ?: break
			if (e.name == "AndroidManifest.xml") manifest = zip.readBytes()
			if (e.name.startsWith("res/") && !e.isDirectory) res = true
			if (e.name == "R.txt") symbols = zip.readBytes().isNotEmpty()
		}
	}
	val pkg = xml(manifest ?: throw IllegalStateException("$what has no AndroidManifest.xml")).getAttribute("package")
	if (pkg.isEmpty()) throw IllegalStateException("$what's manifest names no package")
	return Triple(pkg, res, symbols)
}

fun main(args: Array<String>) {
	if (args.size < 2) { System.err.println("usage: resolve-libraries <lock.json> <group:name:version>..."); exitProcess(2) }
	val roots = args.drop(1).map { val (g, n, v) = it.split(':'); Request("$g:$n", v) }
	val entries = resolve(roots).map { (r, m) ->
		val url = m.file!!
		val toolchain = r.module in TOOLCHAIN
		val bytes = fetch(url) ?: throw IllegalStateException("$url is missing")
		val fields = linkedMapOf("coordinate" to jsonString("${r.module}:${r.version}"), "url" to jsonString(url), "sha256" to jsonString(sha256(bytes)))
		if (url.endsWith(".aar")) aarFacts(bytes, url).let { (pkg, res, symbols) -> fields["package"] = jsonString(pkg); fields["resources"] = res.toString(); fields["rClass"] = symbols.toString() }
		if (toolchain) fields["toolchain"] = "true"
		fields.entries.joinToString(", ", "\t\t{ ", " }") { "\"${it.key}\": ${it.value}" }
	}
	val text = "{\n\t\"version\": \"$LOCK_VERSION\",\n\t\"roots\": ${roots.joinToString(", ", "[", "]") { jsonString("${it.module}:${it.version}") }},\n\t\"artifacts\": [\n${entries.joinToString(",\n")}\n\t]\n}\n"
	File(args[0]).writeText(text)
	println("wrote ${entries.size} artifacts to ${args[0]}")
}
