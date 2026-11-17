import Foundation
@testable import MarklessCore
import Testing

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
	#expect(fields.map(\.0) == ["version", "app", "open", "initial", "steps"])
	guard case let .string(open)? = field("open") else { Issue.record("open is not a path"); return }
	let stack = try NativeAppStack(app: try NativeAppPayload.decode(try #require(field("app"))), path: open)
	let look = { () throws -> [(String, JSONValue)] in
		let top = stack.screens[stack.screens.count - 1].runtime
		return [
			("stack", .array(stack.screens.map { .string($0.path) })),
			("title", try top.title().map(JSONValue.string) ?? .null),
			("texts", .array(try top.texts().map { .array([.string($0.node), .string($0.text)]) })),
		]
	}
	#expect(JSONValue.object(try look()).jsonText == field("initial")?.jsonText)
	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
		guard case let .object(stepFields) = step, case let .object(action)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(event)? = action.first(where: { $0.0 == "event" })?.1
		else { Issue.record("malformed step \(step.jsonText)"); return }
		let journal: [NativeJournalEntry]
		if event == "back" {
			try stack.back()
			journal = []
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
	let known = ["version", "payload", "params", "initial", "initialAttributes", "initialProperties", "initialArms", "initialRows", "steps"]
	#expect(fields.map(\.0).allSatisfy(known.contains), "unknown vector fields \(fields.map(\.0))")
	#expect(field("version") == .string("markless.native-conformance/0"))
	let params = try field("params").map { try NativeViewPayload.decodeParams(try Reader($0, at: "params")) } ?? []
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(try #require(field("payload"))), params: params)

	let initial = JSONValue.array(try runtime.texts().map { .array([.string($0.node), .string($0.text)]) })
	#expect(initial.jsonText == field("initial")?.jsonText)
	let attributes = try runtime.attributes().map { JSONValue.array([.string($0.node), .string($0.name), $0.value.map(JSONValue.string) ?? .null]) }
	#expect(attributes.isEmpty ? field("initialAttributes") == nil : JSONValue.array(attributes).jsonText == field("initialAttributes")?.jsonText)
	let properties = try runtime.properties().map { JSONValue.array([.string($0.node), .string($0.name), .string($0.value)]) }
	#expect(properties.isEmpty ? field("initialProperties") == nil : JSONValue.array(properties).jsonText == field("initialProperties")?.jsonText)
	let rows = try runtime.rows().map { JSONValue.array([.string($0.node), .array($0.keys.map(JSONValue.string))]) }
	#expect(rows.isEmpty ? field("initialRows") == nil : JSONValue.array(rows).jsonText == field("initialRows")?.jsonText)
	let arms = try runtime.arms().map { JSONValue.array([.string($0.node), $0.index.map { .number(Double($0)) } ?? .null]) }
	#expect(arms.isEmpty ? field("initialArms") == nil : JSONValue.array(arms).jsonText == field("initialArms")?.jsonText)

	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
		guard case let .object(stepFields) = step,
			case let .object(actionFields)? = stepFields.first(where: { $0.0 == "action" })?.1,
			case let .string(eventName)? = actionFields.first(where: { $0.0 == "event" })?.1,
			case let .string(host)? = actionFields.first(where: { $0.0 == "host" })?.1,
			actionFields.allSatisfy({ ["event", "host", "value"].contains($0.0) }),
			let expected = stepFields.first(where: { $0.0 == "journal" })?.1
		else { Issue.record("malformed step \(step.jsonText)"); return }
		let event = try #require(NativeEventName(rawValue: eventName))
		let typed: String? = if case let .string(text)? = actionFields.first(where: { $0.0 == "value" })?.1 { text } else { nil }
		let journal = JSONValue.array(try runtime.dispatch(NativeAction(event: event, host: host, value: typed)).map(\.json))
		#expect(Array(journal.jsonText.utf8) == Array(expected.jsonText.utf8), "\(file.lastPathComponent) \(eventName) on \(host)")
	}
}
