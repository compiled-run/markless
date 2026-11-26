import Foundation
@testable import MarklessCore
import Testing

// Factored states (dragon.native-style-export/2): Dragon's groups fixture, whose page, state:a, state:b and branch-site:0 tables
// the host combines. Every entry (each combination, then its interaction states) must be what Dragon's reference composes
// (state-groups.expected.json, from packages/mobile/src/harness/state-groups-fixture.ts): values, root paint, nodes, plan, names.

private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func object(_ value: JSONValue) -> [String: JSONValue] {
	guard case let .object(fields) = value else { return [:] }
	return Dictionary(fields, uniquingKeysWith: { a, _ in a })
}

private func array(_ value: JSONValue?) -> [JSONValue] {
	guard case let .array(items)? = value else { return [] }
	return items
}

private func color(_ value: JSONValue?) -> RGBA? {
	guard let value, case .object = value else { return nil }
	let c = object(value)
	let n = { (key: String) -> Double in if case let .number(v)? = c[key] { return v } else { return .nan } }
	return RGBA(r: n("r"), g: n("g"), b: n("b"), alpha: n("alpha"))
}

/// A node as text, its lines cleared: the expected nodes omit them.
private func described(_ n: StyleNode) -> String {
	var node = StyleNode(
		id: n.id, parent: n.parent, isText: n.isText, isAnonymous: n.isAnonymous, text: n.text, frame: n.frame, borderWidths: n.borderWidths,
		writes: n.writes, borderOps: n.borderOps, scrollRange: n.scrollRange, lines: nil)
	node.selectArrow = n.selectArrow
	node.checkboxMarks = n.checkboxMarks
	node.textAreaLines = n.textAreaLines
	return String(reflecting: node)
}

private func stateGroups(_ name: String, combinations: Int) throws {
	let expected = object(try JSONValue.parse(try fixture("\(name).expected")))
	let pool = array(expected["nodes"])
	let entries = array(object(try #require(expected["ios"]))["entries"]).map(object)
	let exportData = try fixture("\(name).native-style")
	let exportJSON = object(try JSONValue.parse(exportData))
	let iosTarget = object(object(exportJSON["targets"] ?? .null)["ios"] ?? .null)
	let planEntries = array(object(iosTarget["plan"] ?? .null)["assignments"])
	#expect(!planEntries.isEmpty)
	// Each expected entry's nodes decoded as a /0 page's, so the host's nodes are compared by value.
	let wantNodes = try entries.map { e in
		let nodes = JSONValue.array(array(e["nodes"]).map { n -> JSONValue in
			guard case let .number(k) = n else { return .null }
			return pool[Int(k)]
		})
		let plain = "{\"schema\":\"dragon.native-style-export/0\",\"units\":\(try #require(exportJSON["units"]).jsonText),\"fonts\":[],\"targets\":{\"ios\":{\"backend\":\"uikit\",\"viewport\":{\"width\":402,\"height\":778},\"dpr\":3,\"nodes\":\(nodes.jsonText)}}}"
		return try StyleExport.decode(Data(plain.utf8)).assignments[0].nodes.map(described)
	}
	for (what, got) in [
		("\(name)'s export", try StyleExport.decode(exportData)),
		("\(name)'s app style", try #require(try StyleExport.decodeApp(try fixture("\(name).native-app-style"))["/"])),
	] {
		#expect(got.assignments.count == entries.count, "\(what): one entry per combination and interaction state")
		#expect(got.next.count == combinations, "\(what): \(combinations) combinations of the four tables")
		if name.hasSuffix("stacked") {
			let layered = got.assignments.contains { a in
				a.nodes.filter { n in n.writes.contains { if case .paintOrder = $0 { return true } else { return false } } }.count >= 3
			}
			#expect(layered, "\(what): a combination with three layer items, which sort by layer and z-index")
		}
		let groupedPlan = try #require(got.groupedPlan)
		var bad = 0
		var first = ""
		for (k, e) in entries.enumerated() {
			let a = got.assignments[k]
			let values = Dictionary(object(try #require(e["values"])).map { ($0.key, NativeValue(json: $0.value)) }, uniquingKeysWith: { a, _ in a })
			let sent = array(object(try JSONValue.parse(Data(groupedPlan.plan(ofEntry: k).utf8)))["assignments"]).map(\.jsonText)
			let wantParts = array(e["parts"]).map { p -> String in
				guard case let .number(i) = p else { return "" }
				return planEntries[Int(i)].jsonText
			}
			let names = object(try #require(e["names"])).mapValues { v -> String in if case let .string(s) = v { return s } else { return "" } }
			let nodes = a.nodes.map(described)
			let problem: String? =
				if a.values.count != values.count || !a.values.allSatisfy({ key, v in values[key].map { $0.strictlyEquals(v) } ?? false }) {
					"values \(a.values) != \(values)"
				} else if a.canvas != color(e["canvas"]) || a.body != color(e["bodyBackground"]) {
					"root paint \(String(describing: a.canvas))/\(String(describing: a.body))"
				} else if nodes != wantNodes[k] {
					"nodes \(zip(nodes, wantNodes[k]).first { $0 != $1 }.map { "\($0.0)\n  !=\n\($0.1)" } ?? "\(nodes.count) != \(wantNodes[k].count)")"
				} else if sent != wantParts {
					"plan entries differ"
				} else if got.planNames[k] != names {
					"names \(got.planNames[k]) != \(names)"
				} else { nil }
			if let problem {
				bad += 1
				if first.isEmpty { first = "entry \(k): \(problem)" }
			}
		}
		#expect(bad == 0, "\(what): \(bad) of \(entries.count) entries differ from Dragon's reference; \(first)")
		#expect(groupedPlan.line == ",\"groups\":[0,0,0]", "\(what): a factored page's layout line names each group's entry")
	}
}

@Test func factoredStatesComposeAsDragonsReference() throws {
	try stateGroups("state-groups", combinations: 16)
}

@Test func factoredLayerItemsRestackPerCombination() throws {
	try stateGroups("state-groups-stacked", combinations: 16)
}

@Test func aFactoredEntryLaysOutFromEachTablesPlanEntry() throws {
	let style = try StyleExport.decode(try fixture("state-groups.native-style"))
	var lines: [String] = []
	#expect(throws: PayloadError.self) {
		try style.laidOut(width: 402, height: 778, scale: 3, layout: { lines.append($0); return "[\"error\"]" }, entries: [5])
	}
	let line = object(try JSONValue.parse(Data(try #require(lines.first).utf8)))
	#expect(line["assignment"] == .number(0))
	#expect(line["groups"] == .array([.number(0), .number(0), .number(0)]))
	let plan = object(try #require(line["plan"]))
	#expect(array(plan["assignments"]).count == 4)
	#expect(array(plan["groups"]).map { object($0)["first"] } == [.number(1), .number(2), .number(3)])
	#expect(throws: PayloadError.self) { try style.laidOut(width: 402, height: 778, scale: 3, layout: { _ in "" }) }
}
