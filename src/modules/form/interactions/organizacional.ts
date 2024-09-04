import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
	Result,
} from "@sapphire/framework";

import {
	EmbedBuilder,
	GuildMember,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
} from "discord.js";

import { schedule } from "node-cron";
import { isTruthy, merge } from "remeda";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum OrganizationalFormInputIds {
	Time = "Time",
	Hall1 = "Hall1",
	Hall2 = "Hall2",
	Hall3 = "Hall3",
	Stage = "Stage",
	Total = "Total",
	Ombudsman = "Ombudsman",
	TopPosition = "TopPosition",
	GeneralCommand = "GeneralCommand",
	CommandAssistance = "CommandAssistance",
  Promotional = "Promotional",
  Training = "Training",
}

type OrganizationalFormInput = keyof typeof OrganizationalFormInputIds;

const MARKDOWN_CHARS_RE =
	/((`){1,3}|(\*){1,3}|(~){2}|(\|){2}|^(>){1,3}|(_){1,2})+/gm;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class OrganizationalFormInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const guild = await this.container.utilities.discord.getGuild();

		const member = !(interaction.member instanceof GuildMember)
			? await guild.members.fetch(interaction.member.user.id)
			: interaction.member;

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			category: "SECTOR",
			checkFor: "PROMOCIONAL",
			roles: member.roles,
		});

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Organizacional
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result: resultPartial, interaction: interactionFromModal } =
			await this.container.utilities.inquirer.awaitModal<OrganizationalFormInput>(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Horário")
							.setPlaceholder("Ex.: 20:00")
							.setCustomId(OrganizationalFormInputIds.Time)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Posição no TOP")
							.setPlaceholder("Ex.: 1º Lugar")
							.setCustomId(OrganizationalFormInputIds.TopPosition)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Quantidade")
							.setPlaceholder("Total de colaboradores presentes")
							.setCustomId(OrganizationalFormInputIds.Total)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Auxílio do Comando")
							.setPlaceholder("Auxílio do Comando")
							.setCustomId(OrganizationalFormInputIds.CommandAssistance)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Comando Geral")
							.setPlaceholder("Comando Geral")
							.setCustomId(OrganizationalFormInputIds.GeneralCommand)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),
					],
					listenInteraction: true,
					title: "Formulário Organizacional",
				},
			);

		const { result: resultPartial2, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<OrganizationalFormInput>(
				interactionFromModal,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Palco")
							.setPlaceholder("Palco")
							.setCustomId(OrganizationalFormInputIds.Stage)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Ouvidoria")
							.setPlaceholder("Ouvidoria")
							.setCustomId(OrganizationalFormInputIds.Ombudsman)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 1")
							.setPlaceholder("Hall 1")
							.setCustomId(OrganizationalFormInputIds.Hall1)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 2")
							.setPlaceholder("Hall 2")
							.setCustomId(OrganizationalFormInputIds.Hall2)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 3")
							.setPlaceholder("Hall 3")
							.setCustomId(OrganizationalFormInputIds.Hall3)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),
					],
					title: "Formulário Organizacional",
					startButtonLabel: "Continuar - 1",
				},
			);

		const { result: resultPartial3 } =
			await this.container.utilities.inquirer.awaitModal<OrganizationalFormInput>(
				i,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Sala Promocional")
							.setPlaceholder("Sala Promocional")
							.setCustomId(OrganizationalFormInputIds.Promotional)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Sala de Treinamento")
							.setPlaceholder("Sala de Treinamento")
							.setCustomId(OrganizationalFormInputIds.Training)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),
					],
					title: "Formulário Organizacional",
					startButtonLabel: "Continuar - 2",
				},
			);

		const resultFirst = merge(resultPartial, resultPartial2);
		const result = merge(resultFirst, resultPartial3);

		for (const [key, value] of Object.entries(result)) {
			if (isTruthy(value)) continue;
			result[key as OrganizationalFormInput] = "N/D";
		}

		const targets = {
			CommandAssistance: result.CommandAssistance,
			GeneralCommand: result.GeneralCommand,
			Ombudsman: result.Ombudsman,
			Stage: result.Stage,
			Hall1: result.Hall1,
			Hall2: result.Hall2,
			Hall3: result.Hall3,
			Promotional: result.Promotional,
			Training: result.Training,
		};

		type Targets = keyof typeof targets;

		this.container.logger.info(
			"[OrganizationalFormInteractionHandler#run] Report",
			{ report: JSON.stringify(result, null, 2) },
		);

		const members: Record<Targets, (GuildMember | string)[]> = {
			CommandAssistance: [],
			GeneralCommand: [],
			Ombudsman: [],
			Hall1: [],
			Hall2: [],
			Hall3: [],
			Stage: [],
      Promotional: [],
      Training: [],
		};

		const unparsedTargets: [keyof typeof targets, string][] = [];

		for (const [key, value] of Object.entries(targets) as [Targets, string][]) {
			if (value === "N/D") continue;

			unparsedTargets.push(
				...value
					.split(/\s+/gm)
					.filter((v) => v !== "")
					.map((v) => [key, v] as (typeof unparsedTargets)[number]),
			);
		}

		for (const [group, target] of Object.entries(targets) as [
			Targets,
			string,
		][]) {
			if (target === "N/D") continue;

			try {
				const inferredTarget = await Result.fromAsync(
					this.container.utilities.habbo.inferTargetGuildMember(target),
				);

				const { habbo: targetHabbo, member: targetMember } =
					inferredTarget.unwrapOr({ habbo: undefined, member: undefined });

				if (!targetHabbo) {
					this.container.logger.warn(
						`[OrganizationalFormInteractionHandler#run] Couldn't find target: ${target}.`,
					);

					members[group].push(target.replaceAll(MARKDOWN_CHARS_RE, "\\$&"));
					continue;
				}

				if (targetMember)
					await this.container.prisma.user.update({
						where: { discordId: targetMember.user.id },
						data: { reportsHistory: { push: new Date() } },
					});

				members[group].push(
					targetHabbo.name.replaceAll(MARKDOWN_CHARS_RE, "\\$&"),
				);
			} catch (error) {
				members[group].push(target.replaceAll(MARKDOWN_CHARS_RE, "\\$&"));
			}
		}

		this.container.logger.info(
			"[OrganizationalFormInteractionHandler#run] Members",
			{ members: JSON.stringify(members, null, 2) },
		);

		const embed = new EmbedBuilder()
			.setTitle("Formulário Organizacional")
			.setFooter({
				text: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.addFields(
				{
					name: "Horário",
					value: result[OrganizationalFormInputIds.Time],
				},
				{
					name: "Quantidade",
					value: result[OrganizationalFormInputIds.Total],
				},
				{
					name: "Posição no TOP",
					value: result[OrganizationalFormInputIds.TopPosition],
				},
				{
					name: "👥 Auxílio do Comando",
					value: this.#joinList(
						members.CommandAssistance.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🏢 Comando Geral",
					value: this.#joinList(
						members.GeneralCommand.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "📣 Ouvidoria",
					value: this.#joinList(
						members.Ombudsman.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🎤 Palco",
					value: this.#joinList(
						members.Stage.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🏛️ Hall 1",
					value: this.#joinList(
						members.Hall1.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🏛️ Hall 2",
					value: this.#joinList(
						members.Hall2.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🏛️ Hall 3",
					value: this.#joinList(
						members.Hall3.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "💼 Sala Promocional",
					value: this.#joinList(
						members.Promotional.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
				{
					name: "🎯 Sala de Treinamento",
					value: this.#joinList(
						members.Training.map((x) =>
							typeof x === "string" ? x : x.user.toString(),
						),
					),
				},
			)
			.setColor(EmbedColors.Default);

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_ORGANIZATIONAL,
		);

		if (channel === null || !channel.isTextBased()) {
			throw new Error("Forms channel not found or not a text channel.");
		}

		await channel.send({
			embeds: [embed],
		});

		await i
			.deleteReply()
			.catch(() =>
				this.container.logger.error("[Form] Couldn't delete reply."),
			);

		await interactionFromModal
			.deleteReply()
			.catch(() =>
				this.container.logger.error("[Form] Couldn't delete reply."),
			);
	}

	public override onLoad() {
		schedule(
			// "30 15 1,15 * *",
			"*/1 * * * *",
			async () => {
        this.container.logger.info(
          "[OrganizacionalFormInteractionHandler#run] Auto/schedule: 'Relatório Organizacional', day 1 or 15 runned"
        );

				const users = await this.container.prisma.user.findMany({
					where: {
            AND: [
              { activeRenewal: null },
              { latestPromotionRoleId: { not: "788612423363330086" } },
              { latestPromotionRoleId: { not: "788612423363330085" } },
              { latestPromotionRoleId: { not: "1010766202131451995" } },
              { latestPromotionRoleId: { not: "788612423355334664" } },
            ],
          },
				});

        this.container.logger.info(
          `[OrganizacionalFormInteractionHandler#run] Fetched ${users.length} users`
        );

				const filteredUsers = users.filter((user) => {
					return user.reportsHistory.every((report) => {
						const reportDate = new Date(report).getTime();
						const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;

						return reportDate < fifteenDaysAgo;
					});
				});

        this.container.logger.info(
          `[OrganizacionalFormInteractionHandler#run] Filtered ${filteredUsers.length} users`
        );

				const notificationChannel = await this.container.client.channels.fetch(
					ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_ANALYTICS,
				);

				if (notificationChannel?.isTextBased()) {
          try {
            await notificationChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(EmbedColors.Default)
                  .setTitle("Relatório Organizacional - 15 dias")
                  .setDescription(
                    `**${
                      filteredUsers.length
                    }** usuários que tiveram o relatório pendente.\n\n${filteredUsers
                      .map((user) => `- ${user.habboName}`)
                      .join("\n")}`,
                  ),
              ],
            });
          } catch (error) {
            this.container.logger.error(
              `[OrganizacionalFormInteractionHandler#run] Error to send embed: ${error} `
            );
          }
				}

        this.container.logger.info(
          "[OrganizacionalFormInteractionHandler#run] Auto/schedule: 'Relatório Organizacional', end runned"
        );
			},
			{ recoverMissedExecutions: true },
		);
	}

	#joinList(list: string[]) {
		if (list.length === 0) {
			return "N/D";
		}

		return `${list.map((x) => x.split("\\n")).join("\n")}`;
	}
}
