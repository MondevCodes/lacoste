import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import { ENVIRONMENT } from "$lib/env";

import type {
	GuildMember,
	Message,
	MessageEditOptions,
	MessagePayload,
	MessageReplyOptions,
} from "discord.js";

import type { Committee, Sector, System } from "$lib/constants/schemas";
export type Category = "SECTOR" | "SYSTEM" | "COMMITTEE";

export type Roles<T extends Category> = T extends "SECTOR"
	? Sector
	: T extends "SYSTEM"
	  ? System
	  : T extends "COMMITTEE"
		  ? Committee
		  : never;

export type DiscordEphemeralReplyOptions =
	| ({ method?: "reply"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageReplyOptions
	  ))
	| ({ method?: "edit"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageEditOptions
	  ));

export type DiscordHasPermissionOptions<
	T extends Category = Category,
	U extends Roles<T> = Roles<T>,
> = {
	category: T;
	checkFor: U;

	/** Behavior for checking if the user has a higher role than the required. */
	exact?: boolean;
};

const ROLES_ORDER = {
	COMMITTEE: ENVIRONMENT.COMMITTEES_ROLES,
	SECTOR: ENVIRONMENT.SECTORS_ROLES,
	SYSTEM: ENVIRONMENT.SYSTEMS_ROLES,
} as const;

@ApplyOptions<Utility.Options>({
	name: "discord",
})
export class DiscordUtility extends Utility {
	/**
	 * Sends a normal message and deletes it after a certain amount of time.
	 * @param message Message object to send/edit the message.
	 * @param options Options to send/edit the message.
	 * @example
	 * ```ts
	 * await this.container.utilities.discord.sendEphemeralMessage(message, {
	 *   method: 'reply',
	 *   content: 'Hello World!'
	 * });
	 *
	 * // => Sends a message with the content "Hello World!" and deletes it after 30 (default) seconds.
	 * ```
	 */
	public async sendEphemeralMessage(
		message: Message,
		options: DiscordEphemeralReplyOptions,
	) {
		let messageSent: Message;

		if (options.method === "reply") messageSent = await message.reply(options);
		else messageSent = await message.edit(options as MessageEditOptions);

		setTimeout(async () => {
			if (messageSent.deletable) {
				await messageSent.delete();
			} else {
				this.container.logger.warn(
					"[Utilities/DiscordUtility] Message not deletable.",
					{ id: messageSent.id, author: messageSent.author.id },
				);
			}
		}, options.deleteIn ?? 15_000);
	}

	/**
	 * Checks if the user has the required permissions.
	 * @param message Message object to check for permissions.
	 * @param options Object containing the category and role to check for.
	 * @returns Boolean indicating whether the user has the required permissions.
	 *
	 * @example
	 * ```ts
	 * await this.container.utilities.discord.hasPermission(message, {
	 *   category: 'SECTOR',
	 *   checkFor: 'SISTEMA',
	 * });
	 * ```
	 */
	public async hasPermission<T extends Category>(
		options: DiscordHasPermissionOptions<T>,
		message: Message,
	) {
		if (!message.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const member =
			message.member ?? (await message.guild?.members.fetch(message.author.id));

		const exactRole = Object.values(ROLES_ORDER[options.category]).find(
			(x) => x.id === options.checkFor,
		);

		if (!exactRole) {
			throw new Error(
				`[Utilities/DiscordUtility] Invalid role "${options.checkFor}" for category "${options.category}".`,
			);
		}

		const higherRoles = Object.values(ROLES_ORDER[options.category]).filter(
			(x) => x.index >= (exactRole.index ?? 0),
		);

		return options.exact
			? member.roles.cache.has(exactRole.id)
			: higherRoles.some((x) => member.roles.cache.has(x.id));
	}

	/**
	 * Adds default roles to the member.
	 * @param member Member to add default roles to.
	 *
	 * @example
	 * ```ts
	 * await this.container.utilities.discord.addDefaultRoles(message);
	 * ```
	 */
	public async addDefaultRoles(member: GuildMember) {
		await member.roles.add(ENVIRONMENT.DEFAULT_ROLES).catch((error) => {
			this.container.logger.error(
				"[Utilities/DiscordUtility] Could not add default roles.",
				{ error },
			);
		});
	}
}
