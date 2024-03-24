import "@sapphire/pieces";
import "@sapphire/framework";
import "@total-typescript/ts-reset";

import "@sapphire/plugin-hmr";
import "@sapphire/plugin-logger";
import "@sapphire/plugin-utilities-store";

import type { PrismaClient } from "@prisma/client";
import type { DiscordUtility } from "$lib/utilities/discord";
import type { InquirerUtility } from "$lib/utilities/inquirer";
import type { PaginationUtility } from "$lib/utilities/pagination";

declare module "@sapphire/framework" {
	// biome-ignore lint/suspicious/noEmptyInterface: Required to be interface
	interface Preconditions {
		/** ... */
	}
}

declare module "@sapphire/pieces" {
	interface Container {
		prisma: PrismaClient;
	}
}

declare module "@sapphire/plugin-utilities-store" {
	interface Utilities {
		discord: DiscordUtility;
		inquirer: InquirerUtility;
		pagination: PaginationUtility;
	}
}
