import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import { EmbedBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

import type { ButtonInteraction } from "discord.js";

export type Action = "Add" | "Del";

export const BASE_BUTTON_ID = "LCST::ModIndividualInteractionHandler";
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

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModIndividualInteractionHandler extends InteractionHandler {
	async #isAuthorized(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) {
			this.container.logger.warn(
				`[HireInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return false;
		}

		const { roles } =
			interaction.member ??
			(await interaction.guild.members.fetch(interaction.user.id));

		return this.container.utilities.discord.hasPermissionByRole({
			checkFor: "FUNDAÇÃO",
			category: "SECTOR",
			roles,
		});
	}

	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();
		if (!(await this.#isAuthorized(interaction))) return this.none();

		return this.some({ action: decodeButtonId(interaction.customId) });
	}

	public override async run(interaction: ButtonInteraction, data: ParsedData) {
		if (!interaction.inGuild()) {
			this.container.logger.warn(
				`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return;
		}

		const { result, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<"Target" | "Amount">(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setCustomId("Target")
							.setLabel("Membro (Discord ou Habbo)")
							.setPlaceholder(
								"Informe ID do Discord (@Nick) ou do Habbo (Nick).",
							)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setCustomId("Amount")
							.setLabel("Quantidade de Câmbios")
							.setPlaceholder("A quantia de câmbios a ser adicionada")
							.setStyle(TextInputStyle.Short)
							.setRequired(true),
					],
					title: "Adicionar Saldo Individual",
					listenInteraction: true,
				},
			);

		const amount = Number(result.Amount);

		if (Number.isNaN(amount)) {
			this.container.logger.warn(
				`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			await i.editReply({
				content: "Quantia inválida, tente novamente apenas números",
			});
		}

		const cachedGuild =
			interaction.guild ??
			(await this.container.client.guilds.fetch(interaction.guildId));

		const habboProfile = (
			await this.container.utilities.habbo.getProfile(result.Target)
		).unwrapOr(null);

		if (!habboProfile) {
			this.container.logger.warn(
				`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return;
		}

		const targetUser = await this.container.prisma.user.findUnique({
			where: { habboId: habboProfile.user.uniqueId },
			select: {
				id: true,
				latestPromotionDate: true,
				latestPromotionRoleId: true,
			},
		});

		const authorUser = await this.container.prisma.user.findUnique({
			where: {
				discordId: interaction.user.id,
			},
			select: {
				id: true,
			},
		});

		if (!targetUser || !authorUser) {
			this.container.logger.warn(
				"[HireInteractionHandler#run] Author or target user was not found in database.",
			);

			await i.editReply({
				content:
					"Usuário (você ou o perfil do membro) não encontrado no banco de dados, use `vincular`.",
			});

			return;
		}

		await this.container.prisma.user.update({
			where: {
				id: targetUser.id,
			},
			data: {
				ReceivedTransactions: {
					create: {
						amount: data.action === "Add" ? amount : -Math.abs(amount),
						authorId: authorUser.id,
						reason: "Adicionado individualmente",
					},
				},
			},
		});

		await i.editReply({
			content: `${
				data.action === "Add" ? "Adicionado" : "Removido"
			} **${amount}** Câmbios ao perfil de ${habboProfile.user.name}!`,
		});

		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.CMB_LOGS,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		await notificationChannel.send({
			embeds: [
				new EmbedBuilder()
					.setAuthor({
						name: interaction.user.tag,
						iconURL: interaction.user.displayAvatarURL(),
					})
					.setThumbnail(
						`https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboProfile.user.figureString}&size=b`,
					)
					.setDescription(
						`**${amount} Câmbios** adicionado individualmente por ${interaction.user.tag} para ${habboProfile.user.name}`,
					)
					.setColor(EmbedColors.Success),
			],
		});
	}
}
