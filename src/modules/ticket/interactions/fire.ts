import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

export type Action = "Request" | "Approve" | "Reject";

export const BASE_BUTTON_ID = "LCST::FireInteractionHandler";
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

/** @internal @see {@link decodeButtonId} */
export function encodeButtonId(action: Action) {
	return `${BASE_BUTTON_ID}/${action}`;
}

/** @internal @see {@link encodeButtonId} */
export function decodeButtonId(id: string): Action {
	return id.replace(`${BASE_BUTTON_ID}/`, "") as Action;
}

type ParsedData = { action: Action };

const MODAL_INPUTS_OBJ = {
	Target: new TextInputBuilder()
		.setLabel("Avaliado (Discord ou Habbo)")
		.setPlaceholder("Informe ID do Discord (@Nick) ou do Habbo (Nick).")
		.setStyle(TextInputStyle.Short)
		.setCustomId("Target")
		.setRequired(true),

	Reason: new TextInputBuilder()
		.setStyle(TextInputStyle.Paragraph)
		.setLabel("Motivo da demissão")
		.setPlaceholder("Ex.: Inatividade")
		.setCustomId("Reason")
		.setRequired(false),
} satisfies Record<string, TextInputBuilder | "GENERATED">;

const MODAL_INPUTS = Object.values(MODAL_INPUTS_OBJ);
type ModalInput = keyof typeof MODAL_INPUTS_OBJ;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class FireInteractionHandler extends InteractionHandler {
	async #isAuthorized(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) {
			this.container.logger.warn(
				`[FireInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return false;
		}

		const { roles } =
			interaction.member ??
			(await interaction.guild.members.fetch(interaction.user.id));

		switch (decodeButtonId(interaction.customId)) {
			case "Request":
				return this.container.utilities.discord.hasPermissionByRole({
					checkFor: "INICIAL",
					category: "SECTOR",
					roles,
				});

			case "Reject":
			case "Approve":
				return this.container.utilities.discord.hasPermissionByRole({
					checkFor: "PRESIDÊNCIA",
					category: "SECTOR",
					roles,
				});

			default:
				throw new Error("Invalid Action");
		}
	}

	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();
		if (!(await this.#isAuthorized(interaction))) return this.none();

		return this.some({ action: decodeButtonId(interaction.customId) });
	}

	#APPROVAL_ROW = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeButtonId("Approve"))
			.setStyle(ButtonStyle.Success)
			.setLabel("Aprovar"),

		new ButtonBuilder()
			.setCustomId(encodeButtonId("Reject"))
			.setStyle(ButtonStyle.Danger)
			.setLabel("Reprovar"),
	);

	public override async run(
		interaction: ButtonInteraction,
		{ action }: ParsedData,
	) {
		if (!interaction.inGuild()) {
			this.container.logger.warn(
				`[FireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return;
		}

		const cachedGuild =
			interaction.guild ??
			(await this.container.client.guilds.fetch(interaction.guildId));

		if (action === "Request") {
			const { result, interaction: modalInteraction } =
				await this.container.utilities.inquirer.awaitModal<ModalInput>(
					interaction,
					{
						listenInteraction: true,
						inputs: MODAL_INPUTS,
						title: "Demissão",
					},
				);

			const profileResult = await this.container.utilities.habbo.getProfile(
				result.Target,
			);

			if (profileResult.isErr()) {
				await modalInteraction.reply({
					content:
						"Ocorreu um erro ao tentar encontrar o perfil do colaborador, tem certeza que o nome está correto?",
					ephemeral: true,
				});

				return;
			}

			const {
				user: { uniqueId, figureString, name },
			} = profileResult.unwrap();

			const targetUserDb = await this.container.prisma.user.findUnique({
				where: { habboId: uniqueId },
				select: {
					id: true,
					discordId: true,
					latestPromotionDate: true,
					latestPromotionRoleId: true,
				},
			});

			if (!targetUserDb) {
				await modalInteraction.reply({
					content:
						"Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
					ephemeral: true,
				});

				return;
			}

			const targetUser = await cachedGuild.members.fetch(
				targetUserDb.discordId,
			);

			if (!targetUser) {
				await modalInteraction.reply({
					content:
						"Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
					ephemeral: true,
				});
			}

			const currentJobRole = await cachedGuild.roles.fetch(
				targetUserDb.latestPromotionRoleId ?? "",
			);

			if (!currentJobRole) {
				await modalInteraction.reply({
					content:
						"Não consegui encontrar o cargo, tem certeza que ele está registrado no servidor?",
					ephemeral: true,
				});

				return;
			}

			const confirmationEmbed = new EmbedBuilder()
				.setThumbnail(
					`https://www.habbo.com/habbo-imaging/avatarimage?figure=${figureString}`,
				)
				.setAuthor({
					name: name,
				})
				.setFooter({
					text: uniqueId,
				})
				.setTitle("Você tem certeza que deseja demiti-lo(a)?");

			const { result: isConfirmed } =
				await this.container.utilities.inquirer.awaitButtons(modalInteraction, {
					question: {
						embeds: [confirmationEmbed],
					},
					choices: [
						{
							id: "True" as const,
							style: ButtonStyle.Success,
							label: "Sim",
						},
						{
							id: "False" as const,
							style: ButtonStyle.Danger,
							label: "Não",
						},
					],
				});

			if (isConfirmed === "False") {
				await modalInteraction.reply({
					content: "Operação cancelada.",
					ephemeral: true,
				});

				return;
			}

			const approvalChannel = await cachedGuild.channels.fetch(
				ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST,
			);

			if (!approvalChannel?.isTextBased()) {
				throw new Error("Can't send message to non-text channel.");
			}

			const approvalEmbed = new EmbedBuilder()
				.setTitle("Solicitação de Demissão")
				.setColor(EmbedColors.Default)
				.setAuthor({
					name: interaction.user.tag,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.setFooter({
					text: targetUserDb.id,
				})
				.addFields([
					{
						name: "Membro",
						value: result.Target,
					},
					{
						name: "Cargo",
						value: currentJobRole.name,
					},
					{
						name: "Motivo",
						value: result.Reason.length > 0 ? result.Reason : "Nenhum",
					},
				])
				.setThumbnail(
					`https://www.habbo.com/habbo-imaging/avatarimage?figure=${figureString}&size=b`,
				);

			await approvalChannel.send({
				embeds: [approvalEmbed],
				components: [this.#APPROVAL_ROW],
				content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
			});

			await modalInteraction.deleteReply();

			return;
		}

		// ---------------------
		// -  Handle Approval  -
		// ---------------------

		const targetUserId = interaction.message.embeds[0].footer?.text;

		if (!targetUserId) {
			await interaction.reply({
				content: "||305|| Ocorreu um erro, contate o desenvolvedor.",
				ephemeral: true,
			});

			return;
		}

		if (action === "Reject") {
			await interaction.editReply({
				components: [],
				embeds: [
					EmbedBuilder.from(interaction.message.embeds[0])
						.setTitle("Solicitação Rejeitada")
						.setColor(EmbedColors.Error),
				],
			});

			return;
		}

		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		const targetUser = await this.container.prisma.user.findUnique({
			where: {
				id: targetUserId,
			},
		});

		if (!targetUser) {
			await interaction.reply({
				content: "||342|| Ocorreu um erro, contate o desenvolvedor.",
				ephemeral: true,
			});

			return;
		}

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(interaction.guildId));

		const latestPromotionRole =
			targetUser.latestPromotionRoleId &&
			(await guild.roles.fetch(targetUser.latestPromotionRoleId));

		if (latestPromotionRole) {
			await guild.members.removeRole({
				role: latestPromotionRole,
				user: targetUser.discordId,
				reason: "Demissão",
			});
		}

		await this.container.prisma.user.update({
			where: {
				id: targetUserId,
			},
			data: {
				latestPromotionDate: new Date(),
				latestPromotionRoleId: null,
				pendingPromotionRoleId: null,
			},
		});

		await notificationChannel.send({
			embeds: [
				EmbedBuilder.from(interaction.message.embeds[0])
					.setTitle(`Demissão de ${interaction.user.tag}`)
					.addFields([{ name: "Autorizado Por", value: interaction.user.tag }])
					.setColor(EmbedColors.Default),
			],
		});

		await interaction.message.edit({
			components: [],
			embeds: [
				EmbedBuilder.from(interaction.message.embeds[0])
					.setTitle("Demissão Aprovada")
					.setColor(EmbedColors.Success),
			],
		});

		return;
	}
}
