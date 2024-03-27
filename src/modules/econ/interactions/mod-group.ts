import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import {
	ButtonStyle,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

import { ENVIRONMENT } from "$lib/env";

import type { ButtonInteraction } from "discord.js";
import { closest } from "fastest-levenshtein";
import { EmbedColors } from "$lib/constants/discord";

export type Action = "Add" | "Del";

export const BASE_BUTTON_ID = "LCST::ModGroupInteractionHandler";
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
export class ModGroupInteractionHandler extends InteractionHandler {
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
				`[ModGroupInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return;
		}

		const { result, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<
				"TargetRole" | "Targets" | "Amount"
			>(interaction, {
				inputs: [
					new TextInputBuilder()
						.setLabel("Cargo")
						.setCustomId("TargetRole")
						.setPlaceholder("Ex. Estagiário")
						.setStyle(TextInputStyle.Short)
						.setRequired(true),

					new TextInputBuilder()
						.setLabel("Usuários")
						.setCustomId("Targets")
						.setPlaceholder("Ex. @Usuário (Discord) ou Usuário (Habbo)")
						.setStyle(TextInputStyle.Short)
						.setRequired(true),

					new TextInputBuilder()
						.setCustomId("Amount")
						.setLabel("Quantidade de Câmbios")
						.setPlaceholder("A quantia de câmbios a ser adicionada")
						.setStyle(TextInputStyle.Short)
						.setRequired(false),
				],
				title: "Adicionar Saldo Grupo",
				listenInteraction: true,
			});

		const rawAmount = Number(result.Amount);

		const amount =
			rawAmount > 0
				? rawAmount
				: ENVIRONMENT.JOBS_PAYMENT[
						closest(
							result.TargetRole,
							Object.keys(ENVIRONMENT.JOBS_PAYMENT),
						) as keyof typeof ENVIRONMENT.JOBS_PAYMENT
				  ];

		const targets = result.Targets.split(/\s+/).filter((x) => x.length > 0);

		if (targets.length < 1) {
			await interaction.followUp({
				content: "Nenhum usuário informado ou todos estão inválidos.",
				ephemeral: true,
			});

			return;
		}

		if (Number.isNaN(amount) || amount < 0) {
			this.container.logger.warn(
				`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			await interaction.followUp({
				content: `O salário deste cargo (${amount}) é inválido, contate o desenvolvedor.`,
				ephemeral: true,
			});
		}

		const { result: isConfirmed } =
			await this.container.utilities.inquirer.awaitButtons(i, {
				question: {
					embeds: [
						new EmbedBuilder()
							.setTitle("Confirmação")
							.setDescription(
								`Tem certeza que deseja executar a ação de ${
									data.action
								} para ${targets.length} ${
									targets.length === 1 ? "usuário" : "usuários"
								}?`,
							)
							.setFields([
								{
									name: "Usuários",
									value: `- ${targets.join("\n- ")}`,
								},
							])
							.setFooter({
								text: closest(
									result.TargetRole,
									Object.keys(ENVIRONMENT.JOBS_PAYMENT),
								),
							})
							.setColor(EmbedColors.Default),
					],
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

		if (!isConfirmed) {
			await interaction.followUp({
				content: "Operação cancelada pelo usuário.",
				ephemeral: true,
			});

			return;
		}

		for await (const target of targets) {
			const habboProfile = (
				await this.container.utilities.habbo.getProfile(target)
			).unwrapOr(null);

			if (!habboProfile) {
				this.container.logger.warn(
					`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
				);

				return;
			}

			const targetUser = await this.container.prisma.user.findUnique({
				where: {
					habboId: habboProfile.user.uniqueId,
				},
				select: {
					id: true,
					latestPromotionDate: true,
					latestPromotionRoleId: true,
				},
			});

			if (!targetUser) {
				this.container.logger.warn(
					"[HireInteractionHandler#run] Author or target user was not found in database.",
				);

				return;
			}

			this.container.logger.info(
				`[ModGroupInteractionHandler#run] Adding ${amount} to ${target} in group.`,
			);

			await this.container.prisma.user.update({
				where: {
					id: targetUser.id,
				},
				data: {
					ReceivedTransactions: {
						create: {
							amount: data.action === "Add" ? amount : -Math.abs(amount),
							author: { connect: { discordId: interaction.user.id } },
							reason: "Adicionado em grupo",
						},
					},
				},
			});
		}

		await interaction.followUp({
			content: `Operação concluída com sucesso! Todos os ${targets.length} ${
				targets.length === 1 ? "usuário" : "usuários"
			} receberão o valor de ${amount}.`,
			ephemeral: true,
		});
	}
}
