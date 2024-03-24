import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import type {
	Message,
	MessageEditOptions,
	MessagePayload,
	MessageReplyOptions,
} from "discord.js";

export type DiscordEphemeralReplyOptions =
	| ({ method: "reply"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageReplyOptions
	  ))
	| ({ method: "edit"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageEditOptions
	  ));

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
		else messageSent = await message.edit(options);

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
}
