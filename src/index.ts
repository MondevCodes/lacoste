import "dotenv/config";

import "@sapphire/plugin-hmr/register";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-utilities-store/register";

import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { isNonNull } from "remeda";

import { PrismaClient } from "@prisma/client";
import { SapphireClient, container } from "@sapphire/framework";
import { IntentsBitField, type ClientOptions, Partials } from "discord.js";

import { ENVIRONMENT, __DEV__ } from "$lib/env";

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

		this.loadUtilitiesAsync();
		this.loadApplicationCommandRegistriesSync();
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
			const splittedPath = path.split("/");

			const pathType = splittedPath[splittedPath.length - 1] as
				| "commands"
				| "interactions"
				| "listeners"
				| "preconditions";

			switch (pathType) {
				case "commands":
					this.stores.get("commands").registerPath(path);
					break;

				case "interactions":
					this.stores.get("interaction-handlers").registerPath(path);
					break;

				case "listeners":
					this.stores.get("listeners").registerPath(path);
					break;

				case "preconditions":
					this.stores.get("preconditions").registerPath(path);
					break;

				default:
					this.logger.warn(
						`[CustomSapphireClient#loadApplicationCommandRegistriesSync] Unknown path type ${pathType} in path ${path}.`,
					);
			}

			this.logger.info(
				`[CustomSapphireClient#loadApplicationCommandRegistriesSync] ${pathType} ${path}`,
			);
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
		const filesToRegister = readFilesRecursively(
			join(__dirname, "lib", "utilities"),
			[
				...(await this.getFilesWithoutClassesExports(
					join(__dirname, "lib", "utilities"),
				)),
				/.map$/i,
			],
		);

		const foldersWithAtLeastOneClassExport = new Set<string>(
			filesToRegister.map((file) => dirname(file)),
		);

		for (const folder of foldersWithAtLeastOneClassExport) {
			this.stores.get("utilities").registerPath(folder);
			this.logger.info(`[CustomSapphireClient#loadUtilitiesAsync] ${folder}`);
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
			IntentsBitField.Flags.GuildMembers,
			IntentsBitField.Flags.GuildMessages,
      
      IntentsBitField.Flags.GuildPresences,

			IntentsBitField.Flags.MessageContent,

			IntentsBitField.Flags.DirectMessages,
			IntentsBitField.Flags.DirectMessageTyping,
			IntentsBitField.Flags.DirectMessageReactions,
		],

		partials: [Partials.Channel],

		defaultPrefix: "-",
		baseUserDirectory: null,

		caseInsensitiveCommands: true,
		caseInsensitivePrefixes: true,

		loadDefaultErrorListeners: true,
		loadMessageCommandListeners: true,
		loadApplicationCommandRegistriesStatusListeners: true,

		hmr: { enabled: __DEV__ },
		logger: { level: ENVIRONMENT.LOG_LEVEL, depth: Number.POSITIVE_INFINITY },
	});

	container.prisma = new PrismaClient();

	await container.prisma.$connect();
	await sapphireClient.login(ENVIRONMENT.DISCORD_TOKEN);
}

if (require.main === module) {
	void run();
}
