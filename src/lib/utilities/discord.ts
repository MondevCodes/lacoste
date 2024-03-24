import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import { Environment } from "$lib/env";

import type {
	Message,
	MessageEditOptions,
	MessagePayload,
	MessageReplyOptions,
} from "discord.js";

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

export type DiscordRestrictedKeys =
	(typeof Environment.AUTHORIZED_ROLES)[number]["key"];

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

	public async isAuthorized(role: DiscordRestrictedKeys, message: Message) {
		if (!message.inGuild()) {
			throw new Error("Cannot send message outside of a guild.");
		}

		const member =
			message.member ?? (await message.guild.members.fetch(message.author));

		const ids = Environment.AUTHORIZED_ROLES.find((r) => r.key === role)?.ids;

		if (!ids) {
			this.container.logger.warn(
				`[Utilities/DiscordUtility] Unknown role: ${role}`,
			);

			return false;
		}

		return member.roles.cache.some((r) => ids.includes(r.id));
	}
}
