import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
	time,
} from "discord.js";

import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { z } from "zod";
import { schedule } from "node-cron";

import { ApplyOptions } from "@sapphire/decorators";
import { RenewalPeriod } from "@prisma/client";

import { ENVIRONMENT } from "$lib/env";
import { EmbedColors } from "$lib/constants/discord";

const ActionData = z.object({
	action: z.enum([
		"SelfRequestRenew",
		"SelfRequestReturn",
		"AdminRequestLeave",
	]),

	id: z
		.string()
		.optional()
		.refine((value) => value && /^[a-f\d]{24}$/i.test(value), {
			message: "Invalid ObjectId",
		}),
});

type ActionData = z.infer<typeof ActionData>;

const BASE_BUTTON_ID = "LCST::DepartmentInteractionHandler";
const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

export function encodeButtonId(data: ActionData) {
	return `${BASE_BUTTON_ID}/${JSON.stringify(data)}`;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DepartmentInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) {
			return this.none();
		}

		if (!interaction.inGuild()) {
			this.container.logger.warn(
				`[HireInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return this.none();
		}

		const { action, id } = ActionData.parse(
			JSON.parse(interaction.customId.split("/")[1]),
		);

		const { members } =
			interaction.guild ??
			(await interaction.client.guilds.fetch(interaction.guildId));

		const { roles } =
			"toJSON" in interaction.member
				? interaction.member
				: await members.fetch(interaction.user.id);

		let isAuthorized: boolean;

		switch (action) {
			case "AdminRequestLeave":
				isAuthorized = this.container.utilities.discord.hasPermissionByRole({
					checkFor: "PRESIDÊNCIA",
					category: "SECTOR",
					roles,
				});

				break;

			case "SelfRequestRenew":
			case "SelfRequestReturn":
				isAuthorized = await this.#hasPendingRenewal(interaction.user.id);

				break;
		}

		return isAuthorized ? this.some({ action, id }) : this.none();
	}

	public override async run(interaction: ButtonInteraction, data: ActionData) {
		// ----------------
		// --    SELF    --
		// ----------------

		if (
			(data.action === "SelfRequestRenew" ||
				data.action === "SelfRequestReturn") &&
			data.id
		) {
			if (data.action === "SelfRequestRenew") {
				// Renewal Period

				const [renewalPeriod] =
					await this.container.utilities.inquirer.awaitSelectMenu(interaction, {
						placeholder: "Selecionar",
						question: "Por quanto tempo deseja afastar o usuário?",
						choices: [
							{ id: "Cancel", label: "Cancelar", emoji: "❌" },
							{
								id: RenewalPeriod.Leave15Days,
								label: "15 Dias",
								emoji: "⏳",
							},
							{
								id: RenewalPeriod.Leave30Days,
								label: "30 Dias",
								emoji: "⏳",
							},
						] as const,
					});

				if (renewalPeriod === "Cancel") {
					await interaction.reply({
						content: "Operação cancelada.",
						ephemeral: true,
					});

					return;
				}

				await this.container.prisma.user.update({
					where: {
						id: interaction.user.id,
					},
					data: {
						activeRenewal: renewalPeriod,
						activeRenewalStartedAt: new Date(),
					},
				});

				const renewalPeriodInMilliseconds =
					renewalPeriod === "Leave15Days"
						? 1000 * 60 * 60 * 24 * 15
						: 1000 * 60 * 60 * 24 * 30;

				await interaction.message.edit({
					embeds: [
						EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
							`Você foi afastado até ${time(
								new Date(Date.now() + renewalPeriodInMilliseconds),
								"f",
							)}.`,
						),
					],
				});

				await interaction.reply({
					content:
						"Operação concluída, você receberá uma notificação quando seu afastamento estiver perto de expirar.",
					ephemeral: true,
				});

				return;
			}

			return await this.#demote(interaction.user.id, interaction);
		}

		// ---------------
		// --   ADMIN   --
		// ---------------

		const { interaction: interactionFromModal, result } =
			await this.container.utilities.inquirer.awaitModal(interaction, {
				title: "Aplicar Afastamento",
				listenInteraction: true,

				inputs: [
					new TextInputBuilder()
						.setCustomId("target")
						.setLabel("Avaliado (Discord ou Habbo)")
						.setPlaceholder("Informe ID do Discord (@Nick) ou do Habbo (Nick).")
						.setStyle(TextInputStyle.Short)
						.setRequired(true),
				],
			});

		const { member: targetMember, habbo: targetHabbo } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				result.target,
			);

		if (!targetMember) {
			await interactionFromModal.editReply({
				content: "Não foi possível encontrar o usuário informado.",
			});

			return;
		}

		// Confirmation

		const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
			interactionFromModal,
			{
				choices: [
					{
						id: "true" as const,
						style: ButtonStyle.Success,
						label: "Sim",
					},
					{
						id: "false" as const,
						style: ButtonStyle.Danger,
						label: "Não",
					},
				],
				question: {
					content: `Tem certeza que deseja afastar <@${targetMember.user.id}>?`,
				},
			},
		);

		if (isConfirmed.result === "false") {
			await interactionFromModal.editReply({
				content: "Operação cancelada.",
			});

			return;
		}

		// Renewal Period

		const [renewalPeriod] =
			await this.container.utilities.inquirer.awaitSelectMenu(
				interactionFromModal,
				{
					placeholder: "Selecionar",
					question: "Por quanto tempo deseja afastar o usuário?",
					choices: [
						{ id: "Cancel", label: "Cancelar", emoji: "❌" },
						{ id: RenewalPeriod.Leave15Days, label: "15 Dias", emoji: "⏳" },
						{ id: RenewalPeriod.Leave30Days, label: "30 Dias", emoji: "⏳" },
					] as const,
				},
			);

		if (renewalPeriod === "Cancel") {
			await interactionFromModal.editReply({
				content: "Operação cancelada.",
			});

			return;
		}

		// Applies Demotion

		const guild = await this.container.client.guilds.fetch(
			ENVIRONMENT.GUILD_ID,
		);

		const renewalRole = await guild.roles.fetch(
			renewalPeriod === RenewalPeriod.Leave15Days
				? ENVIRONMENT.SYSTEMS_ROLES.AFASTADO15.id
				: ENVIRONMENT.SYSTEMS_ROLES.AFASTADO30.id,
		);

		if (!renewalRole) {
			await interactionFromModal.editReply({
				content:
					"Não foi possível encontrar o cargo informado (15 dias ou 30 dias), contate o desenvolvedor.",
			});

			return;
		}

		await guild.members.addRole({
			user: targetMember,
			role: renewalRole,
		});

		const { id } = await this.container.prisma.user.update({
			where: {
				discordId: targetMember.user.id,
			},
			data: {
				activeRenewal: renewalPeriod,
				activeRenewalStartedAt: new Date(),
			},
		});

		const dmChannel = targetMember.dmChannel || (await targetMember.createDM());

		const readableRenewalPeriod =
			renewalPeriod === "Leave15Days" ? "15 dias" : "30 dias";

		const renewalPeriodInMilliseconds =
			renewalPeriod === "Leave15Days"
				? 1000 * 60 * 60 * 24 * 15
				: 1000 * 60 * 60 * 24 * 30;

		const dmMsg = await dmChannel.send({
			embeds: [
				new EmbedBuilder()
					.setColor(EmbedColors.Default)
					.setTitle("Afastamento Temporário")
					.setDescription(
						`Você foi afastado até ${time(
							new Date(Date.now() + renewalPeriodInMilliseconds),
							"f",
						)}.`,
					)
					.setFooter({
						text: interaction.user.tag,
						iconURL: interaction.user.displayAvatarURL(),
					})
					.setThumbnail(
						`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.user.figureString}&size=b`,
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setStyle(ButtonStyle.Primary)
						.setLabel("Retornar")
						.setCustomId(
							encodeButtonId({
								action: "SelfRequestReturn",
								id,
							}),
						),

					new ButtonBuilder()
						.setStyle(ButtonStyle.Primary)
						.setLabel("Renovar")
						.setDisabled(true)
						.setCustomId(
							encodeButtonId({
								action: "SelfRequestRenew",
								id,
							}),
						),
				),
			],
		});

		await this.container.prisma.user.update({
			where: { id },
			data: { activeRenewalMessageId: dmMsg.id },
		});

		await interactionFromModal.editReply({
			content: `O usuário <@${targetMember.user.id}> foi afastado com sucesso!`,
			components: [],
		});

		const notificationChannel = await this.container.client.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_DEMOTION,
		);

		if (notificationChannel?.isTextBased()) {
			await notificationChannel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle(`Afastamento de ${readableRenewalPeriod}`)
						.setAuthor({
							name: interaction.user.tag,
							iconURL: interaction.user.displayAvatarURL(),
						})
						.setFooter({
							text: targetMember.nickname || targetMember.user.username,
							iconURL: targetMember.displayAvatarURL(),
						})
						.setThumbnail(
							`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.user.figureString}&size=b`,
						),
				],
			});
		}
	}

	public override onLoad() {
		/**
		 * Schedules a cron job to run every 15 minutes.
		 * @summary Applies demotions to users who have pending renewals.
		 */
		schedule("*/15 * * * *", async () => {
			const users = await this.container.prisma.user.findMany({
				where: { activeRenewal: { not: null } },
			});

			for await (const user of users) {
				const hasPendingRenewal = await this.#hasPendingRenewal(user.discordId);

				if (hasPendingRenewal) {
					const renewalPeriodInMilliseconds =
						user.activeRenewal === "Leave15Days"
							? 1000 * 60 * 60 * 24 * 15
							: 1000 * 60 * 60 * 24 * 30;

					const renewalPeriod = new Date(
						Date.now() + renewalPeriodInMilliseconds,
					);

					if (renewalPeriod < new Date())
						return await this.#demote(user.discordId);

					// if between 1 and 3 days send dm
					if (renewalPeriod < new Date(Date.now() + 1000 * 60 * 60 * 24 * 3)) {
						const targetMember = await this.container.client.users.fetch(
							user.discordId,
						);
						if (!targetMember || !user.activeRenewalMessageId) return;

						await targetMember.send({
							content:
								"Seu afastamento está perto de expirar, por favor, renove-o ou retorne.",
							reply: {
								failIfNotExists: false,
								messageReference: user.activeRenewalMessageId,
							},
						});
					}
				}
			}
		});
	}

	// Private Methods
	// Private Methods
	// Private Methods

	/** Checks if a user has a pending renewal by their Discord ID. */
	async #hasPendingRenewal(id: string) {
		const renewal = await this.container.prisma.user.findUnique({
			where: { discordId: id, activeRenewal: { not: null } },
		});

		return !!renewal;
	}

	/** Demotes a user to a lower rank by their Discord ID. */
	async #demote(id: string, interaction?: ButtonInteraction) {
		const user = await this.container.prisma.user.findUnique({
			where: { discordId: id },
		});

		if (!user) {
			await interaction?.reply({
				content: "[||E831||] Usuário não encontrado.",
				ephemeral: true,
			});

			return;
		}

		const member = await this.container.client.guilds
			.fetch(ENVIRONMENT.GUILD_ID)
			.then((guild) => guild.members.fetch(id));

		const currentSector =
			this.container.utilities.discord.inferHighestSectorRole(member.roles);

		if (!currentSector) {
			await interaction?.reply({
				content: "[||E412||] Você não está em um setor.",
				ephemeral: true,
			});

			return;
		}

		const currentSectorIndex =
			Object.values(ENVIRONMENT.SECTORS_ROLES).find(
				(r) => r.id === currentSector.id,
			)?.index ?? 0;

		const previousSectorRoleId = Object.values(ENVIRONMENT.SECTORS_ROLES)
			.filter((r) => r.index < currentSectorIndex)
			.sort((a, b) => b.index - a.index)[0]?.id;

		if (!previousSectorRoleId) {
			await interaction?.reply({
				content: "[||E812||] Houve um erro ao rebaixar este usuário.",
				ephemeral: true,
			});

			return;
		}

		const guild = await this.container.client.guilds.fetch(
			ENVIRONMENT.GUILD_ID,
		);

		const previousSector = await guild.roles.fetch(previousSectorRoleId);

		if (!previousSector) {
			await interaction?.reply({
				content: "[||E157||] Houve um erro ao rebaixar este usuário.",
				ephemeral: true,
			});

			return;
		}

		await member.roles.remove(currentSector);
		await member.roles.add(previousSector);

		await this.container.prisma.user.update({
			where: {
				discordId: id,
			},
			data: {
				latestPromotionDate: new Date(),
				latestPromotionRoleId: currentSector.id,
			},
		});
	}
}
