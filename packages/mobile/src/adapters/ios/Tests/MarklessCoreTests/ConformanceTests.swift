import Foundation
@testable import MarklessCore
import Testing

private let conformanceDirectory: URL = {
	if let override = ProcessInfo.processInfo.environment["MARKLESS_CONFORMANCE_DIR"] { return URL(fileURLWithPath: override) }
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url.appendingPathComponent("conformance")
}()

private func vectorFiles() throws -> [URL] {
	try FileManager.default.contentsOfDirectory(at: conformanceDirectory, includingPropertiesForKeys: nil)
		.filter { $0.pathExtension == "json" }
		.sorted { $0.lastPathComponent < $1.lastPathComponent }
}

@Test func conformanceVectorsExist() throws {
	#expect(try !vectorFiles().isEmpty, "no conformance vectors in \(conformanceDirectory.path)")
}

@Test(arguments: try vectorFiles())
func reproducesConformanceVector(file: URL) throws {
	let vector = try JSONValue.parse(Data(contentsOf: file))
	guard case let .object(fields) = vector else { Issue.record("vector is not an object"); return }
	let field = { (key: String) -> JSONValue? in fields.first { $0.0 == key }?.1 }
	let known = ["version", "payload", "params", "initial", "initialAttributes", "initialProperties", "initialArms", "initialRows", "tasks", "steps"]
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

	let tasks = try runtime.tasks().map(\.json)
	#expect(tasks.isEmpty ? field("tasks") == nil : JSONValue.array(tasks).jsonText == field("tasks")?.jsonText)

	guard case let .array(steps)? = field("steps") else { Issue.record("steps is not an array"); return }
	for step in steps {
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
