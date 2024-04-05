import { randomUUID } from "node:crypto";

import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Colors,
	ComponentType,
	EmbedBuilder,
	ModalBuilder,
	SelectMenuBuilder,
	SelectMenuOptionBuilder,
} from "discord.js";

import type {
	ButtonInteraction,
	Collection,
	Interaction,
	Message,
	TextInputBuilder,
	MessageReplyOptions,
	ModalSubmitInteraction,
	CacheType,
} from "discord.js";

const ID_SEPARATOR = "&";

function getChoiceById<T extends BaseValue>(
	choices: T[],
	choice: unknown,
): T | undefined {
	return choices.find((c) => {
		if (typeof c.id === "string") {
			return c.id === choice;
		}

		if (typeof c.id === "number") {
			return c.id === Number.parseInt(String(choice), 10);
		}

		if (typeof c.id === "boolean") {
			return c.id === Boolean(c);
		}

		return c.id === choice;
	});
}

export interface BaseOptions<T> {
	/** Question to ask the user. */
	question: string | MessageReplyOptions;

	/** Available choices for the user to select. */
	choices: T[];

	/** Whether the question should be asked in the user's DM. */
	inDM?: boolean;

	/** Timeout for the question. Defaults to `1000 * 30`. */
	timeout?: number;
}

export interface BaseValue {
	/** Unique identifier for this value. */
	id: string | number | boolean;
}

export interface BaseReturn<T, I extends Interaction> {
	result: T;
	interaction: I;
}

export interface MessagesInquirerOptions
	extends Omit<BaseOptions<unknown>, "choices"> {
	/** Maximum number of messages to retrieve. */
	maxMessages?: number;

	/** Timeout for the message. */
	timeout?: number;

	/** Delete the message used to ask the user a question. */
	deleteQuestion?: boolean;

	/** Delete the retrieved messages after receiving the answer. */
	deleteRetrievedMessages?: boolean;
}

export interface ButtonValue extends BaseValue {
	/** Label to display on the button. */
	label: string;

	/** What style to use for the button. */
	style: ButtonStyle;

	/** Emoji to display on the button. */
	emoji?: string;
}

export interface ButtonsInquirerOptions extends BaseOptions<ButtonValue> {
	/** Should the button be disabled? */
	setButtonsDisabledWhenCollected?: boolean;

	/**
	 * Message to edit the original message with when the user selects this button. When undefined,
	 * the message will be deleted
	 */
	postAnswerMessage?: string;
}

export interface ModalInquirerOptions
	extends Omit<BaseOptions<unknown>, "choices" | "question"> {
	/** Title of the modal. */
	title: string;

	/** Inputs to display in the modal. The inputs will be displayed in the order they are in the array. */
	inputs: TextInputBuilder[];

	/** Weather to listen for an interaction or send a button */
	listenInteraction?: boolean;

	/** Label to display on the submit button. */
	startButtonLabel?: string;

	/** Question to ask the user. */
	question?: string | MessageReplyOptions;
}

export type SelectMenuOptionType =
	| "user"
	| "role"
	| "string"
	| "channel"
	| "mentionable";

export interface SelectMenuValue extends BaseValue {
	/** Label to display on the button. */
	label: string;

	/** Emoji to display on the choice. */
	emoji?: string;

	/** Description to display on the choice. */
	description?: string;
}

export interface SelectMenuInquirerOptions
	extends BaseOptions<SelectMenuValue> {
	/** Select menu's placeholder text. */
	placeholder: string;

	/** Select menu's minimum number of values. */
	minValues?: number;

	/** Select menu's maximum number of values. */
	maxValues?: number;

	/** @todo Update select menu types to newer versions. */
	type?: SelectMenuOptionType;

	/** Should the menu be disabled? */
	setDisabledWhenDone?: boolean;

	/** Message to edit the original message with when the user selects this button. */
	postAnswerMessage?: string;
}

@ApplyOptions<Utility.Options>({
	name: "inquirer",
})
export class InquirerUtility extends Utility {
	/**
	 * Ask the user a question using buttons and return the user's response.
	 * @param interaction The interaction to use for the inquirer.
	 * @param options Configuration options for the inquirer.
	 * @returns The id of the selected choice.
	 */
	public async awaitButtons<T extends ButtonsInquirerOptions>(
		interaction: Interaction,
		options: T,
	): Promise<BaseReturn<T["choices"][number]["id"], ButtonInteraction>> {
		if (!interaction.isRepliable()) {
			throw new Error("The interaction must be repliable.");
		}

		const uuid = randomUUID();

		const channel = !options.inDM
			? interaction.channel
			: interaction.user.dmChannel ?? (await interaction.user.createDM());

		if (!channel) {
			throw new Error("Could not found a channel to prompt the user with.");
		}

		if (![ChannelType.DM, ChannelType.GuildText].includes(channel.type)) {
			throw new Error("Cannot send message to non-text channel.");
		}

		if (interaction.inGuild() && !interaction.deferred) {
			await interaction.deferReply({ ephemeral: true });
		}

		const buttonActionRow = new ActionRowBuilder<ButtonBuilder>();

		const buttons = options.choices.map((choice) => {
			const button = new ButtonBuilder()
				.setLabel(choice.label)
				.setStyle(choice.style)
				.setCustomId(`${uuid}${ID_SEPARATOR}${choice.id}`);

			choice.emoji && button.setEmoji(choice.emoji);

			return button;
		});

		buttonActionRow.addComponents(buttons);

		const message = !options.inDM
			? await interaction.editReply({
					...(typeof options.question === "string"
						? { content: options.question }
						: options.question),
					components: [buttonActionRow],
			  })
			: await channel.send({
					...(typeof options.question === "string"
						? { content: options.question }
						: options.question),
					components: [buttonActionRow],
			  });

		const answer = await channel.awaitMessageComponent({
			componentType: ComponentType.Button,
			filter: (component) =>
				component.customId.startsWith(`${uuid}${ID_SEPARATOR}`) &&
				component.user.id === interaction.user.id,
			time: options.timeout ?? 30 * 60 * 1000,
		});

		await answer.deferUpdate();

		if (options.postAnswerMessage) {
			let updatedButtons: ButtonBuilder[] = [];

			if (options.setButtonsDisabledWhenCollected) {
				updatedButtons = updatedButtons.map((button) => {
					return ButtonBuilder.from(button).setDisabled(true);
				});
			}

			const updatedButtonsActionRow = new ActionRowBuilder<ButtonBuilder>();
			updatedButtonsActionRow.addComponents(updatedButtons);

			if (options.inDM) {
				await message.edit({
					components: [updatedButtonsActionRow],
					content: options.postAnswerMessage,
				});
			} else {
				await interaction.editReply({
					components: [updatedButtonsActionRow],
					content: options.postAnswerMessage,
				});
			}
		} else {
			if (options.inDM && message.deletable) {
				await message.delete();
			}
		}

		const [, choiceUniqueId] = answer.customId.split(ID_SEPARATOR);
		return {
			result: getChoiceById(options.choices, choiceUniqueId)
				?.id as T["choices"][number]["id"],
			interaction: answer,
		};
	}

	/**
	 * Ask the user a question using a modal that starts with a button.
	 * @param interaction The interaction to use for the inquirer.
	 * @param options Configuration options for the inquirer.
	 * @returns A collection of messages sent by the user.
	 */
	public async awaitMessages<T extends MessagesInquirerOptions>(
		interaction: Interaction,
		options: T,
	): Promise<Collection<string, Message>> {
		if (!interaction.isRepliable()) {
			throw new Error("The interaction must be repliable.");
		}

		const channel = options.inDM
			? interaction.user.dmChannel ?? (await interaction.user.createDM())
			: interaction.channel;

		if (!channel) {
			throw new Error("Could not found a channel to prompt the user with.");
		}

		if (![ChannelType.DM, ChannelType.GuildText].includes(channel?.type)) {
			throw new Error("Cannot send message to non-text channel.");
		}

		if (interaction.inGuild() && !interaction.deferred) {
			await interaction.deferReply({ ephemeral: true });
		}

		const messageOptions = {
			components: [],
			embeds: [],
			...(typeof options.question === "string"
				? { content: options.question }
				: options.question),
		};

		const message = options.inDM
			? await channel.send(messageOptions)
			: await interaction.editReply(messageOptions);

		const messages = await channel.awaitMessages({
			filter: (message) => message.author.id === interaction.user.id,
			time: options.timeout ?? 1000 * 30,
			max: options.maxMessages ?? 1,
			errors: ["time"],
		});

		const messagesClone = messages.clone();

		if (options.deleteRetrievedMessages) {
			for await (const [, message] of messages) {
				if (message.deletable) await message.delete();
			}
		}

		if (options.deleteQuestion) {
			if (message.deletable) {
				await message.delete();
			}
		}

		return messagesClone;
	}

	/**
	 * Ask the user a question using a modal that starts with a button.
	 * @param interaction The interaction to use for the inquirer.
	 * @param options Configuration options for the inquirer.
	 * @returns An object containing the user's response and the interaction used to get the response.
	 */
	public async awaitModal<
		K extends string = string,
		T extends ModalInquirerOptions = ModalInquirerOptions,
	>(
		interaction: Interaction,
		options: T,
	): Promise<BaseReturn<Record<K, string>, ModalSubmitInteraction>> {
		if (!interaction.isRepliable()) {
			throw new Error("The interaction must be repliable.");
		}

		const uuid = randomUUID();

		const channel = options.inDM
			? interaction.user.dmChannel ?? (await interaction.user.createDM())
			: interaction.channel;

		if (!channel) {
			throw new Error("Could not found a channel to prompt the user with.");
		}

		if (![ChannelType.DM, ChannelType.GuildText].includes(channel.type)) {
			throw new Error("Cannot send message to non-text channel.");
		}

		options.listenInteraction ??= false;

		let modalSubmit: ModalSubmitInteraction<CacheType>;

		const modal = new ModalBuilder().setCustomId(uuid).setTitle(options.title);

		modal.addComponents(
			options.inputs.map((input) =>
				new ActionRowBuilder<TextInputBuilder>().addComponents(input),
			),
		);

		if (options.listenInteraction && interaction.isButton()) {
			await interaction.showModal(modal);

			modalSubmit = await interaction.awaitModalSubmit({
				time: options.timeout ?? 30 * 60 * 1000,
				filter: (component) => component.user.id === interaction.user.id,
			});
		} else {
			const button = new ButtonBuilder()
				.setLabel(options.startButtonLabel ?? "Start")
				.setCustomId(`${uuid}${ID_SEPARATOR}start`)
				.setStyle(ButtonStyle.Success);

			const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				button,
			);

			const messageOptions: MessageReplyOptions = {
				components: [buttonRow],
				...(typeof options.question === "string"
					? { content: options.question }
					: options.question),
			};

			if (options.inDM) {
				await channel.send(messageOptions);
			} else {
				if (!interaction.deferred)
					await interaction.deferReply({ ephemeral: true });

				await interaction.editReply(messageOptions);
			}

			const collectedButton = await channel.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (component) =>
					component.customId.startsWith(`${uuid}${ID_SEPARATOR}`) &&
					component.user.id === interaction.user.id,
				time: options.timeout ?? 30 * 60 * 1000,
			});

			await collectedButton.showModal(modal);

			modalSubmit = await collectedButton.awaitModalSubmit({
				time: options.timeout ?? 30 * 60 * 1000,
				filter: (component) => component.user.id === interaction.user.id,
			});
		}

		await modalSubmit.deferReply({ ephemeral: true }).catch((error) => {
			this.container.logger.warn(
				`[ModalInquirer#parse] ${interaction.user.id} unknown error while awaiting modal submit.`,
				{ error },
			);
		});

		return {
			interaction: modalSubmit,
			result: modalSubmit.fields.fields.reduce(
				(acc, field) => {
					acc[field.customId as K] = field.value;
					return acc;
				},
				{} as Record<K, string>,
			),
		};
	}

	/**
	 * Ask the user a question using a select menu and return the user's response.
	 * @param interaction The interaction to use for the inquirer.
	 * @param options Configuration options for the inquirer.
	 * @returns The id of the selected choice.
	 */
	public async awaitSelectMenu<T extends SelectMenuInquirerOptions>(
		interaction: Interaction,
		options: T,
	): Promise<T["choices"][number]["id"][]> {
		if (!interaction.isRepliable()) {
			throw new Error("The interaction must be repliable.");
		}

		const uuid = randomUUID();

		const channel = !options.inDM
			? interaction.channel
			: interaction.user.dmChannel ?? (await interaction.user.createDM());

		if (!channel) {
			throw new Error("Could not found a channel to prompt the user with.");
		}

		if (![ChannelType.DM, ChannelType.GuildText].includes(channel?.type)) {
			throw new Error("Cannot send message to non-text channel.");
		}

		if (interaction.inGuild() && !interaction.deferred) {
			await interaction.deferReply({ ephemeral: true });
		}

		// TODO: Deprecated classes `SelectMenuBuilder`/`SelectMenuOptionBuilder`

		const opts = options.choices.map((choice) => {
			const optionBuilder = new SelectMenuOptionBuilder()
				.setLabel(choice.label)
				.setValue(choice.id.toString());

			choice.emoji && optionBuilder.setEmoji(choice.emoji);
			choice.description && optionBuilder.setDescription(choice.description);

			return optionBuilder;
		});

		const selectMenu = new SelectMenuBuilder()
			.setPlaceholder(options.placeholder)
			.setCustomId(uuid)
			.setOptions(opts)
			.setMinValues(options.minValues ?? 1)
			.setMaxValues(options.maxValues ?? 1);

		const selectMenuActionRow =
			new ActionRowBuilder<SelectMenuBuilder>().addComponents(selectMenu);

		const message = (
			!options.inDM
				? await interaction.editReply({
						...(typeof options.question === "string"
							? { content: options.question }
							: options.question),
						components: [selectMenuActionRow],
				  })
				: await channel.send({
						...(typeof options.question === "string"
							? { content: options.question }
							: options.question),
						components: [selectMenuActionRow],
				  })
		) as Message<boolean>;

		const answer = await channel.awaitMessageComponent({
			componentType: ComponentType.SelectMenu,
			filter: (component) =>
				component.customId === uuid &&
				component.user.id === interaction.user.id,
			time: options.timeout ?? 30 * 60 * 1000,
		});

		await answer.deferUpdate();

		let updatedSelectMenu: SelectMenuBuilder = selectMenu;

		if (options.setDisabledWhenDone) {
			updatedSelectMenu = SelectMenuBuilder.from(selectMenu).setDisabled(true);
		}

		const updatedActionRow = new ActionRowBuilder<SelectMenuBuilder>();
		updatedActionRow.addComponents(updatedSelectMenu);

		if (options.postAnswerMessage) {
			if (options.inDM) {
				await message.edit({
					components: [updatedActionRow],
					content: options.postAnswerMessage,
				});
			} else {
				await interaction.editReply({
					components: [updatedActionRow],
					content: options.postAnswerMessage,
				});
			}
		} else {
			if (!options.inDM) {
				if (options.setDisabledWhenDone) {
					selectMenu.setDisabled(true);

					await interaction.editReply({
						components: [updatedActionRow],
					});
				}
			} else {
				if (message.deletable) await message.delete();
			}
		}

		const choice = getChoiceById(options.choices, answer.values[0]);

		if (!choice) {
			throw new Error("No choice found for selected value.");
		}

		return answer.values as T["choices"][number]["id"][];
	}

	/**
	 * Alias for `awaitSelectMenu` to ask the user a yes/no question.
	 * @param interaction The interaction to use for the inquirer.
	 * @returns A boolean representing the user's choice.
	 */
	public async awaitConfirmation(interaction: Interaction, message?: string) {
		return await this.awaitButtons(interaction, {
			question: {
				embeds: [
					new EmbedBuilder()
						.setDescription(message ?? "Are you sure you want to do this?")
						.setColor(Colors.Blurple),
				],
			},
			choices: [
				{
					id: "True" as const,
					style: ButtonStyle.Success,
					emoji: "✅",
					label: "Yes",
				},
				{
					id: "False" as const,
					style: ButtonStyle.Danger,
					emoji: "❌",
					label: "No",
				},
			],
		});
	}
}
