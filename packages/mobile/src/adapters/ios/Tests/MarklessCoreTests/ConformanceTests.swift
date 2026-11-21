import Foundation
@testable import MarklessCore
import MarklessMobile
import Testing

/// The app's engine as the vectors were written: JavaScriptCore here, `crypto` drawing from an all-zero seed.
private func conformanceScriptHost() -> NativeScriptHost {
	NativeScriptHost(engine: { try JavaScriptCoreEngine() }, seed: { String(repeating: "0", count: 64) })
}

private let conformanceDirectory: URL = {
	if let override = ProcessInfo.processInfo.environment["MARKLESS_CONFORMANCE_DIR"] { return URL(fileURLWithPath: override) }
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url.appendingPathComponent("conformance")
}()

private func allVectorFiles() throws -> [URL] {
	try FileManager.default.contentsOfDirectory(at: conformanceDirectory, includingPropertiesForKeys: nil)
		.filter { $0.pathExtension == "json" }
		.sorted { $0.lastPathComponent < $1.lastPathComponent }
}

private func versionOf(_ file: URL) throws -> String? {
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: file)) else { return nil }
	if case let .string(version)? = fields.first(where: { $0.0 == "version" })?.1 { return version }
	return nil
}

private func vectorFiles() throws -> [URL] { try allVectorFiles().filter { try versionOf($0) != "markless.native-app-conformance/0" } }
private func appVectorFiles() throws -> [URL] { try allVectorFiles().filter { try versionOf($0) == "markless.native-app-conformance/0" } }

@Test func appConformanceVectorsExist() throws {
	#expect(try !appVectorFiles().isEmpty, "no navigation vectors in \(conformanceDirectory.path)")
}

/// The stack after each action: its paths, the top screen's title and texts, as `nativeAppConformance` writes them.
@Test(arguments: try appVectorFiles())
func reproducesAppConformanceVector(file: URL) throws {
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: file)) else { Issue.record("vector is not an object"); return }
	let field = { (key: String) -> JSONValue? in fields.first { $0.0 == key }?.1 }
	#expect(fields.map(\.0) == ["version", "app", "open"] + (field("started") == nil ? [] : ["started"]) + ["initial", "steps"])
	guard case let .string(open)? = field("open") else { Issue.record("open is not a path"); return }
	let stack = try NativeAppStack(app: try NativeAppPayload.decode(try #require(field("app"))), path: open, scriptHost: conformanceScriptHost())
	let look = { () throws -> [(String, JSONValue)] in
		let top = stack.screens[stack.screens.count - 1].runtime
		return [
			("stack", .array(stack.screens.map { .string($0.path) })),
			("title", try top.title().map(JSONValue.string) ?? .null),
			("texts", .array(try top.texts().map { .array([.string($0.node), .string($0.text)]) })),
		]
	}
	let started = stack.started.map(\.json)
	#expect(started.isEmpty ? field("started") == nil : JSONValue.array(started).jsonText == field("started")?.jsonText)
	#expect(JSONValue.object(try look()).jsonText == field("initial")?.jsonText)
	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
		guard case let .object(stepFields) = step, case let .object(action)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(event)? = action.first(where: { $0.0 == "event" })?.1
		else { Issue.record("malformed step \(step.jsonText)"); return }
		let journal: [NativeJournalEntry]
		if event == "back" {
			journal = try stack.back()
		} else {
			guard case let .string(host)? = action.first(where: { $0.0 == "host" })?.1 else { Issue.record("no host"); return }
			journal = try stack.dispatch(NativeAction(event: try #require(NativeEventName(rawValue: event)), host: host))
		}
		let got = JSONValue.object([("action", .object(action)), ("journal", .array(journal.map(\.json)))] + (try look()))
		#expect(Array(got.jsonText.utf8) == Array(step.jsonText.utf8), "\(file.lastPathComponent) \(event)")
	}
}

@Test func conformanceVectorsExist() throws {
	#expect(try !vectorFiles().isEmpty, "no conformance vectors in \(conformanceDirectory.path)")
}

@Test(arguments: try vectorFiles())
func reproducesConformanceVector(file: URL) throws {
	let vector = try JSONValue.parse(Data(contentsOf: file))
	guard case let .object(fields) = vector else { Issue.record("vector is not an object"); return }
	let field = { (key: String) -> JSONValue? in fields.first { $0.0 == key }?.1 }
	let known = ["version", "payload", "params", "preferredLanguages", "now", "layout", "initial", "initialChecks", "initialSelections", "initialAttributes", "initialProperties", "initialArms", "initialRows", "initialSheets", "tasks", "start", "steps", "leave"]
	#expect(fields.map(\.0).allSatisfy(known.contains), "unknown vector fields \(fields.map(\.0))")
	#expect(field("version") == .string("markless.native-conformance/0"))
	let params = try field("params").map { try NativeViewPayload.decodeParams(try Reader($0, at: "params")) } ?? []
	let languages = try field("preferredLanguages").map { try Reader($0, at: "preferredLanguages").array().map { try $0.string() } } ?? ["en"]
	let now: Double? = if case let .number(time)? = field("now") { time } else { nil }
	let runtime = NativeRuntime(
		payload: try NativeViewPayload.decode(try #require(field("payload"))), params: params, preferredLanguages: languages,
		now: { now ?? (Date().timeIntervalSince1970 * 1000).rounded(.down) }, scriptHost: conformanceScriptHost())
	if case let .object(boxes)? = field("layout") {
		let layout = try Dictionary(uniqueKeysWithValues: boxes.map { id, box in
			guard case let .object(members) = box else { throw VectorError("layout.\(id) is not an object") }
			let member = { (key: String) in members.first { $0.0 == key }?.1 }
			func number(_ key: String) throws -> Double {
				guard case let .number(value)? = member(key) else { throw VectorError("layout.\(id).\(key) is not a number") }
				return value
			}
			return (id, NativeElementBox(
				x: try number("x"), y: try number("y"), width: try number("width"), height: try number("height"),
				rightToLeft: member("direction") == .string("rtl")))
		})
		runtime.measure = { layout[$0] }
	}

	let initial = JSONValue.array(try runtime.texts().map { .array([.string($0.node), .string($0.text)]) })
	#expect(initial.jsonText == field("initial")?.jsonText)
	let attributes = try runtime.attributes().map { JSONValue.array([.string($0.node), .string($0.name), $0.value.map(JSONValue.string) ?? .null]) }
	#expect(attributes.isEmpty ? field("initialAttributes") == nil : JSONValue.array(attributes).jsonText == field("initialAttributes")?.jsonText)
	let properties = try runtime.properties().map { JSONValue.array([.string($0.node), .string($0.name), .string($0.value)]) }
	#expect(properties.isEmpty ? field("initialProperties") == nil : JSONValue.array(properties).jsonText == field("initialProperties")?.jsonText)
	let rows = try runtime.rows().map { JSONValue.array([.string($0.node), .array($0.keys.map(JSONValue.string))]) }
	#expect(rows.isEmpty ? field("initialRows") == nil : JSONValue.array(rows).jsonText == field("initialRows")?.jsonText)
	let checks = try runtime.checks().map { JSONValue.array([.string($0.node), .bool($0.checked)]) }
	#expect(checks.isEmpty ? field("initialChecks") == nil : JSONValue.array(checks).jsonText == field("initialChecks")?.jsonText)
	let selections = try runtime.selections().map { JSONValue.array([.string($0.node), .bool($0.selected)]) }
	#expect(selections.isEmpty ? field("initialSelections") == nil : JSONValue.array(selections).jsonText == field("initialSelections")?.jsonText)
	let arms = try runtime.arms().map { JSONValue.array([.string($0.node), $0.index.map { .number(Double($0)) } ?? .null]) }
	#expect(arms.isEmpty ? field("initialArms") == nil : JSONValue.array(arms).jsonText == field("initialArms")?.jsonText)
	let sheets = try runtime.sheets().map { JSONValue.array([.string($0.node), .bool($0.open)]) }
	#expect(sheets.isEmpty ? field("initialSheets") == nil : JSONValue.array(sheets).jsonText == field("initialSheets")?.jsonText)

	let tasks = try runtime.tasks().map(\.json)
	#expect(tasks.isEmpty ? field("tasks") == nil : JSONValue.array(tasks).jsonText == field("tasks")?.jsonText)
	let start = try runtime.start().map(\.json)
	#expect(start.isEmpty ? field("start") == nil : JSONValue.array(start).jsonText == field("start")?.jsonText)
	defer {
		let leave = runtime.payload.cells.contains { $0.async != nil } ? (try? runtime.leave().map(\.json)) ?? [.string("leave threw")] : []
		#expect(leave.isEmpty ? field("leave") == nil : JSONValue.array(leave).jsonText == field("leave")?.jsonText)
	}

	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
		if case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			eventName == "response",
			case let .number(id)? = actionFields.first(where: { $0.0 == "id" })?.1,
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		{
			let journal = try runtime.response(Int(id), try NativeFetchResponse.decode(try Reader(try #require(actionFields.first(where: { $0.0 == "response" })?.1), at: "response")))
			#expect(Array(JSONValue.array(journal.map(\.json)).jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) \(eventName) \(id)")
			continue
		}
		if case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			eventName == "resume",
			case let .string(continuation)? = actionFields.first(where: { $0.0 == "continuation" })?.1,
			let value = actionFields.first(where: { $0.0 == "value" })?.1,
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		{
			let journal = try runtime.resume(continuation, value: NativeValue(json: value))
			#expect(Array(JSONValue.array(journal.map(\.json)).jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) resume \(continuation)")
			continue
		}
		if case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			eventName == "reject",
			case let .string(continuation)? = actionFields.first(where: { $0.0 == "continuation" })?.1,
			case let .object(errorFields)? = actionFields.first(where: { $0.0 == "error" })?.1,
			case let .string(name)? = errorFields.first(where: { $0.0 == "name" })?.1,
			case let .string(message)? = errorFields.first(where: { $0.0 == "message" })?.1,
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		{
			let journal = try runtime.reject(continuation, name: name, message: message)
			#expect(Array(JSONValue.array(journal.map(\.json)).jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) reject \(continuation)")
			continue
		}
		if case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			eventName == "device" || eventName == "settle",
			case let .string(cell)? = actionFields.first(where: { $0.0 == "cell" })?.1,
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		{
			let value = actionFields.first(where: { $0.0 == "value" }).map { NativeValue(json: $0.1) }
			let error = actionFields.first(where: { $0.0 == "error" })?.1
			let journal: [NativeJournalEntry]
			if eventName == "device" {
				journal = try runtime.device(cell, try #require(value))
			} else if case let .object(errorFields)? = error,
				case let .string(name)? = errorFields.first(where: { $0.0 == "name" })?.1,
				case let .string(message)? = errorFields.first(where: { $0.0 == "message" })?.1
			{
				journal = try runtime.settle(cell, errorName: name, message: message)
			} else {
				journal = try runtime.settle(cell, value: try #require(value))
			}
			#expect(Array(JSONValue.array(journal.map(\.json)).jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) \(eventName) on \(cell)")
			continue
		}
		guard case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			let event = NativeEventName(rawValue: eventName),
			actionFields.allSatisfy({
				(event == .timer ? ["event", "timer"] : ["event", "host", "value", "reason", "key", "text", "detail"] + (event.isTouch ? ["pointerId", "x", "y", "time"] : [])).contains($0.0)
			}),
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		else { Issue.record("malformed step \(step.jsonText)"); return }
		let string = { (key: String) -> String? in if case let .string(text)? = actionFields.first(where: { $0.0 == key })?.1 { text } else { nil } }
		let number = { (key: String) -> Double? in if case let .number(value)? = actionFields.first(where: { $0.0 == key })?.1 { value } else { nil } }
		let action: NativeAction
		if event == .timer {
			action = NativeAction(event: .timer, timer: try #require(string("timer")))
		} else {
			let detail: Int? = if case let .number(count)? = actionFields.first(where: { $0.0 == "detail" })?.1 { Int(count) } else { nil }
			action = NativeAction(
				event: event, host: try #require(string("host")), value: string(event == .keydown || event == .keyup ? "key" : event == .paste ? "text" : "value"), reason: string("reason"),
				detail: detail, pointerId: number("pointerId"), x: number("x"), y: number("y"), time: number("time"))
		}
		let journal = JSONValue.array(try runtime.dispatch(action).map(\.json))
		#expect(Array(journal.jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) \(eventName) on \(action.timer ?? action.host)")
	}
}

/// A page whose handlers are all data never starts the engine; a script page starts the app's one engine on first use.
@Test func engineStartsOnFirstScriptUseOnly() throws {
	let file = conformanceDirectory.appendingPathComponent("script-app.json")
	guard case let .object(fields) = try JSONValue.parse(Data(contentsOf: file)) else { Issue.record("vector is not an object"); return }
	let host = conformanceScriptHost()
	let stack = try NativeAppStack(app: try NativeAppPayload.decode(try #require(fields.first { $0.0 == "app" }?.1)), path: "/", scriptHost: host)
	_ = try stack.dispatch(NativeAction(event: .activate, host: "h3"))
	#expect(host.starts == 0)
	_ = try stack.dispatch(NativeAction(event: .activate, host: "component-edge:0"))
	#expect(host.starts == 0)
	_ = try stack.dispatch(NativeAction(event: .activate, host: "h4"))
	_ = try stack.dispatch(NativeAction(event: .activate, host: "h4"))
	#expect(host.starts == 1)
}

struct VectorError: Error, CustomStringConvertible {
	let description: String
	init(_ description: String) { self.description = description }
}
