import { defineConfig } from "tsup";

export default defineConfig({
	// Output
	splitting: false,
	sourcemap: true,
	keepNames: true,
	// minify: true,

	format: ["cjs"],

	// Input
	entry: ["src/**/*!(.d).ts", "!src/types.d.ts"],
	skipNodeModulesBundle: true,
	shims: false,

	// TypeScript
	tsconfig: "tsconfig.json",
	target: "es2020",
	dts: false,

	// Others
	replaceNodeEnv: true,
	bundle: false,
	clean: true,

	onSuccess: "resolve-tspaths -o dist/",
});
