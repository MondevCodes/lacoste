import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ComponentType,
} from "discord.js";

import type {
	BaseMessageOptions,
	ButtonInteraction,
	DiscordjsError,
	Interaction,
} from "discord.js";

/**
 * Takes a promise and returns a tuple with the data or error.
 * @param promise Promise to try.
 *
 * @example
 * ```typescript
 * const [data, error] = await tryPromise(promise);
 * ```
 */
async function tryPromise<E extends Error, T>(
	promise: Promise<T>,
): Promise<[T, null] | [null, E]> {
	return promise
		.then<[T, null]>((data) => [data, null])
		.catch<[null, E]>((error) => [null, error]);
}

export enum PaginationResult {
	/**
	 * The pagination session timed out.
	 */
	Timeout = 0,

	/**
	 * The pagination session was closed by the user.
	 */
	Closed = 1,

	/**
	 * An unknown error occurred.
	 */
	Unknown = 2,
}

/** @extends BaseMessageOptions Remove components from the base message options. */
export type PaginableBaseMessageOptions = BaseMessageOptions;

/** Handler for resolving the message options for each page. */
export type Resolver = (
	page: number,
	options: Options,
) => Promise<PaginableBaseMessageOptions> | PaginableBaseMessageOptions;

export interface Options {
	/**
	 * Amount of pages to paginate.
	 */
	amount: number;

	/**
	 * Handles the message options for each page.
	 */
	resolve: Resolver;

	/**
	 * Use ephemeral messages for the pagination session.
	 */
	ephemeral?: boolean;

	/**
	 * Buttons options to use for the pagination session.
	 */
	buttons?: ButtonOptions;

	/**
	 * If true, all resolvers will be loaded before starting the pagination.
	 * @default false
	 */
	preload?: boolean;

	/**
	 * Adds a button to the message that shows the current page number.
	 * @default false
	 */
	showPageNumber?: boolean;

	/**
	 * Adds buttons to the message that allow the user to go to the first and last page.
	 * @default false
	 */
	showFirstLastButtons?: boolean;

	/**
	 * Adds a button to the message that allows the user to close the pagination session.
	 * @default false
	 */
	showCloseButton?: boolean;

	/**
	 * Time in milliseconds to wait until the pagination session times out.
	 * @default 120_000
	 */
	timeout?: number;
}

export interface ButtonOptions {
	previous?: Button;
	first?: Button;
	next?: Button;
	last?: Button;
	close?: Button;
}

export interface Button {
	label: string;
	style: ButtonStyle;
	emoji?: string;
}

const BUTTON_ID = {
	PREVIOUS: "PREVIOUS",
	FIRST: "FIRST",
	LAST: "LAST",
	NEXT: "NEXT",
	CLOSE: "CLOSE",
};

@ApplyOptions<Utility.Options>({
	name: "pagination",
})
export class PaginationUtility extends Utility {
	/**
	 * Starts a pagination session with the given interaction and options.
	 * @param interaction Interaction to start the pagination session.
	 * @param options Options for the pagination session.
	 * @returns The result of the pagination session.
	 *
	 * @example
	 * ```typescript
	 * await this.container.utilities.pagination.run(interaction, {
	 * 	resolver: (page) => ({ content: `Page ${page + 1}` })
	 * 	amount: 5,
	 * });
	 *
	 * // => Starts a pagination session with 5 pages and returns the status of the session.
	 * ```
	 */
	public async run(
		interaction: Interaction,
		options: Options,
	): Promise<PaginationResult> {
		if (options.amount < 1) {
			throw new Error(
				"Cannot start a pagination session with less than 1 page.",
			);
		}

		if (!interaction.inGuild()) {
			throw new Error("Cannot start a pagination session outside of a guild.");
		}

		if (!interaction.isRepliable()) {
			throw new Error(
				"Cannot start a pagination session without a repliable interaction.",
			);
		}

		if (!interaction.channelId) {
			throw new Error(
				"Cannot start a pagination session without a channel ID.",
			);
		}

		// Adjusting the amount by subtracting 1 aligns with the 0-indexing
		// convention in Node.js arrays, resulting in a human-readable page count.
		options.amount--;

		let closed = false;
		let currentPage = 0;

		const pages = await this.generateInitialPages(options);

		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({
				...pages[currentPage],
				ephemeral: options.ephemeral ?? false,
			});
		} else {
			await interaction.reply({
				...pages[currentPage],
				ephemeral: options.ephemeral ?? false,
			});
		}

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(interaction.guildId));

		const channel =
			interaction.channel ??
			(await guild.channels.fetch(interaction.channelId));

		if (channel?.type !== ChannelType.GuildText) {
			throw new Error(
				"Cannot start a pagination session in a non-text channel.",
			);
		}

		while (!closed) {
			const [component, componentError] = await tryPromise<
				DiscordjsError,
				ButtonInteraction
			>(
				channel.awaitMessageComponent({
					componentType: ComponentType.Button,
					time: options.timeout ?? 120e3,
					filter: (componentInteraction) =>
						componentInteraction.user.id === interaction.user.id,
				}),
			);

			if (componentError) {
				if (componentError.name === "Error [InteractionCollectorError]") {
					return PaginationResult.Timeout;
				}

				return PaginationResult.Unknown;
			}

			await component.deferUpdate();

			switch (component.customId) {
				case BUTTON_ID.FIRST:
					currentPage = 0;
					break;

				case BUTTON_ID.LAST:
					currentPage = options.amount;
					break;

				case BUTTON_ID.NEXT:
					currentPage++;
					break;

				case BUTTON_ID.PREVIOUS:
					currentPage--;
					break;

				case BUTTON_ID.CLOSE:
					closed = true;
					break;

				default:
					throw new Error(
						"Cannot start a pagination session with an invalid button ID.",
					);
			}

			const newPage = await this.generatePage(options, currentPage);
			await component.editReply(newPage);
		}

		return PaginationResult.Closed;
	}

	/**
	 * @private Generates the initial pages for the given resolver with the given options.
	 */
	private async generateInitialPages(
		options: Options,
	): Promise<PaginableBaseMessageOptions[]> {
		if (options.preload) {
			return Promise.all(
				Array.from({ length: options.amount }, async (_, index) => {
					return this.generatePage(options, index);
				}),
			);
		}

		// Otherwise, only load the first, second, and last page to
		// reduce the amount of unnecessary calls (e.g. database queries).

		return [
			await this.generatePage(options, 0),
			await this.generatePage(options, 1),
			await this.generatePage(options, options.amount - 1),
		];
	}

	/**
	 * @private Generates a message options with controls for the given page.
	 */
	private async generatePage(
		options: Options,
		page: number,
	): Promise<BaseMessageOptions> {
		const controlActionRow = new ActionRowBuilder<ButtonBuilder>();

		if (options.showPageNumber) {
			controlActionRow.addComponents(
				new ButtonBuilder()
					.setLabel(`${page + 1} / ${options.amount + 1}`)
					.setDisabled(true)
					.setCustomId("PN")
					.setStyle(ButtonStyle.Secondary),
			);
		}

		if (options.showFirstLastButtons) {
			const { label, emoji, style } = options.buttons?.first ?? {
				label: "First",
				id: BUTTON_ID.FIRST,
				style: ButtonStyle.Danger,
			};

			const firstButton = new ButtonBuilder()
				.setCustomId(BUTTON_ID.FIRST)
				.setLabel(label)
				.setStyle(style)
				.setDisabled(page === 0);

			if (emoji) {
				firstButton.setEmoji(emoji);
			}

			controlActionRow.addComponents(firstButton);
		}

		const {
			label: previousLabel,
			emoji: previousEmoji,
			style: previousStyle,
		} = options.buttons?.previous ?? {
			label: "Previous",
			id: BUTTON_ID.PREVIOUS,
			style: ButtonStyle.Primary,
		};

		const {
			label: nextLabel,
			emoji: nextEmoji,
			style: nextStyle,
		} = options.buttons?.next ?? {
			label: "Next",
			id: BUTTON_ID.NEXT,
			style: ButtonStyle.Primary,
		};

		const previousButton = new ButtonBuilder()
			.setCustomId(BUTTON_ID.PREVIOUS)
			.setLabel(previousLabel)
			.setStyle(previousStyle)
			.setDisabled(page === 0);

		if (previousEmoji) previousButton.setEmoji(previousEmoji);

		const nextButton = new ButtonBuilder()
			.setCustomId(BUTTON_ID.NEXT)
			.setLabel(nextLabel)
			.setStyle(nextStyle)
			.setDisabled(page === options.amount);

		if (nextEmoji) nextButton.setEmoji(nextEmoji);

		controlActionRow.addComponents(previousButton, nextButton);

		if (options.showFirstLastButtons) {
			const { label, emoji, style } = options.buttons?.last ?? {
				label: "Last",
				id: BUTTON_ID.LAST,
				style: ButtonStyle.Danger,
			};

			const lastButton = new ButtonBuilder()
				.setCustomId(BUTTON_ID.LAST)
				.setLabel(label)
				.setStyle(style)
				.setDisabled(page === options.amount);

			if (emoji) lastButton.setEmoji(emoji);

			controlActionRow.addComponents(lastButton);
		}

		if (options.showCloseButton) {
			const { label, emoji, style } = options.buttons?.close ?? {
				label: "Close",
				id: BUTTON_ID.CLOSE,
				style: ButtonStyle.Danger,
			};

			const closeButton = new ButtonBuilder()
				.setCustomId(BUTTON_ID.CLOSE)
				.setLabel(label)
				.setStyle(style);
			if (emoji) closeButton.setEmoji(emoji);

			controlActionRow.addComponents(closeButton);
		}

		const resolvedOptions = await options.resolve(page, options);

		return {
			...resolvedOptions,
			components: [...(resolvedOptions.components ?? []), controlActionRow],
		};
	}
}
