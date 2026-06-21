// swift-tools-version: 6.0

import PackageDescription

let package = Package(
	name: "ArcadeNativeProof",
	platforms: [
		.iOS(.v17),
	],
	products: [
		.library(name: "ArcadeNativeProof", targets: ["ArcadeNativeProof"]),
	],
	targets: [
		.target(
			name: "ArcadeNativeProof",
			resources: [
				.process("Resources"),
			],
		),
		.testTarget(
			name: "ArcadeNativeProofTests",
			dependencies: ["ArcadeNativeProof"],
		),
	],
)
