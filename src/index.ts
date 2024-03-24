import "dotenv/config";

import "@sapphire/plugin-hmr/register";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-utilities-store/register";

import { isNonNull } from "remeda";
import { dirname, join } from "node:path";
import { readdirSync, statSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import { SapphireClient, container } from "@sapphire/framework";
import { IntentsBitField, type ClientOptions } from "discord.js";

import { Environment, __DEV__ } from "$lib/env";

/**
 * Reads all files recursively from the given directory.
 * @param dirname Directory to read all files recursively.
 * @param protectedDirs Protected directories to ignore.
 * @returns All files with full paths from the given directory.
 *
 * @example
 * ```typescript
 * const files = readFilesRecursively(join(__dirname, 'modules'));
 * => ['/path/to/your/directory/file1.txt', '/path/to/your/directory/file2.js', ...]
 * ```
 */
function readFilesRecursively(
	dirname: string,
	protectedFiles: (string | RegExp)[] = [],
): string[] {
	const filesAndDirs = readdirSync(dirname);

	const result: string[] = [];

	for (const fileOrDir of filesAndDirs) {
		const fullPath = join(dirname, fileOrDir);
		const stats = statSync(fullPath);

		if (stats.isFile()) {
			if (
				protectedFiles.some((protectedFile) => {
					if (typeof protectedFile === "string")
						return protectedFile === join(dirname, fileOrDir);

					return protectedFile.test(fileOrDir);
				})
			) {
				continue;
			}

			result.push(fullPath);
		} else if (stats.isDirectory()) {
			result.push(...readFilesRecursively(fullPath, protectedFiles));
		}
	}

	return result;
}

/**
 * Extends {@link SapphireClient} functionalities.
 */
export default class CustomSapphireClient extends SapphireClient {
	constructor(options: ClientOptions) {
		super(options);
		asyncConstructor.call(this);

		async function asyncConstructor(this: CustomSapphireClient) {
			await this.loadApplicationCommandRegistriesSync();
			await this.loadUtilitiesAsync();
		}
	}

	/**
	 * Loads all application command registries in the custom modules folder.
	 *
	 * @example
	 * ```typescript
	 * await client.loadApplicationCommandRegistries();
	 * ```
	 */
	private async loadApplicationCommandRegistriesSync(): Promise<void> {
		const filesToRegister = readFilesRecursively(join(__dirname, "modules"), [
			...(await this.getFilesWithoutClassesExports(join(__dirname, "modules"))),
			/.map$/i,
		]);

		const foldersWithAtLeastOneClassExport = new Set<string>(
			filesToRegister.map((file) => dirname(file)),
		);

		for (const path of foldersWithAtLeastOneClassExport) {
			this.stores.registerPath(path);
		}
	}

	/**
	 * Loads all utilities in the custom utilities folder (excluding protected files).
	 *
	 * @example
	 * ```typescript
	 * await client.loadUtilitiesAsync();
	 * ```
	 */
	private async loadUtilitiesAsync(): Promise<void> {
		const filesToRegister = readFilesRecursively(join(__dirname, "utilities"), [
			...(await this.getFilesWithoutClassesExports(
				join(__dirname, "lib", "utilities"),
			)),
			/.map$/i,
		]);

		const foldersWithAtLeastOneClassExport = new Set<string>(
			filesToRegister.map((file) => dirname(file)),
		);

		for (const folder of foldersWithAtLeastOneClassExport) {
			this.stores.get("utilities").registerPath(folder);
		}
	}

	/**
	 * Gets all files without classes exports from the given directory.
	 * @returns All files without classes exports from the given directory.
	 *
	 * @example
	 * ```typescript
	 * await this.getFilesWithoutClassesExports();
	 * => ['/path/to/your/protected1.txt', '/path/to/your/protected2.js', ...]
	 * ```
	 */
	private async getFilesWithoutClassesExports(
		directory: string,
	): Promise<string[]> {
		const files = readFilesRecursively(directory)
			.filter((file) => /\.(ts|js|cjs|mjs)$/i.test(file))
			.filter((file) => !file.endsWith(".map"));

		const rawProtectedFiles = await Promise.all(
			files.map(async (file) => {
				const exports = await import(file);

				const hasAnyClassMember =
					Object.keys(exports).some((key) => {
						const value = exports[key];
						return typeof value === "function" && value.prototype;
					}) ||
					(exports.default &&
						typeof exports.default.default === "function" &&
						exports.default.default.prototype);

				return hasAnyClassMember ? null : file;
			}),
		);

		return rawProtectedFiles.filter(isNonNull);
	}
}

async function run(): Promise<void> {
	const sapphireClient = new CustomSapphireClient({
		intents: [
			IntentsBitField.Flags.Guilds,
			IntentsBitField.Flags.GuildMessages,
			IntentsBitField.Flags.MessageContent,
		],

		defaultPrefix: "-",
		baseUserDirectory: null,

		caseInsensitiveCommands: true,
		caseInsensitivePrefixes: true,

		loadDefaultErrorListeners: true,
		loadMessageCommandListeners: true,
		loadApplicationCommandRegistriesStatusListeners: true,

		hmr: { enabled: __DEV__ },
		logger: { level: Environment.LOG_LEVEL },
	});

	container.prisma = new PrismaClient();

	await container.prisma.$connect();
	await sapphireClient.login(Environment.DISCORD_TOKEN);
}

if (require.main === module) {
	void run();
}
