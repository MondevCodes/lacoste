import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	EmbedBuilder,
	GuildMember,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
} from "discord.js";

import { schedule } from "node-cron";
import { merge, pick } from "remeda";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum OrganizationalFormInputIds {
	Time = "Time",
	Hall1 = "Hall1",
	Hall2 = "Hall2",
	Hall3 = "Hall3",
	Stage = "Stage",
	GeneralCommand = "GeneralCommand",
	CommandAssistance = "CommandAssistance",
	Ombudsman = "Ombudsman",
	Total = "Total",
	TopPosition = "TopPosition",
}

type OrganizationalFormInput = keyof typeof OrganizationalFormInputIds;

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
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Comando Geral")
							.setPlaceholder("Comando Geral")
							.setCustomId(OrganizationalFormInputIds.GeneralCommand)
							.setRequired(false),
					],
					listenInteraction: true,
					title: "Formulário Organizacional",
				},
			);

		const { result: resultPartial2 } =
			await this.container.utilities.inquirer.awaitModal<OrganizationalFormInput>(
				interactionFromModal,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Palco")
							.setPlaceholder("Palco")
							.setCustomId(OrganizationalFormInputIds.Stage)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Ouvidoria")
							.setPlaceholder("Ouvidoria")
							.setCustomId(OrganizationalFormInputIds.Ombudsman)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 1")
							.setPlaceholder("Hall 1")
							.setCustomId(OrganizationalFormInputIds.Hall1)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 2")
							.setPlaceholder("Hall 2")
							.setCustomId(OrganizationalFormInputIds.Hall2)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Hall 3")
							.setPlaceholder("Hall 3")
							.setCustomId(OrganizationalFormInputIds.Hall3)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),
					],
					title: "Formulário Organizacional",
					startButtonLabel: "Continuar",
				},
			);

		const result = merge(resultPartial, resultPartial2);

		for (const [key, value] of Object.entries(result) as [
			OrganizationalFormInput,
			string,
		][]) {
			if (value === "" || !value || value === null) {
				result[key] = "N/A";
			}
		}

		const targets = pick(result, [
			"CommandAssistance",
			"GeneralCommand",
			"Ombudsman",
			"Stage",
			"Hall1",
			"Hall2",
			"Hall3",
		]);

		const members: Record<
			Exclude<OrganizationalFormInput, "Time" | "TopPosition">,
			GuildMember[]
		> = {
			CommandAssistance: [],
			GeneralCommand: [],
			Ombudsman: [],
			Hall1: [],
			Hall2: [],
			Hall3: [],
			Stage: [],
			Total: [],
		};

		for await (const [group, target] of Object.entries(targets) as [
			Exclude<OrganizationalFormInput, "Time" | "TopPosition">,
			string,
		][]) {
			const { member: targetMember } =
				await this.container.utilities.habbo.inferTargetGuildMember(target);

			if (!targetMember) {
				await interactionFromModal.editReply({
					content: `O usuário informado (${target}) não foi encontrado, você tem certeza que o nome é correto?`,
					components: [],
					embeds: [],
				});

				return;
			}

			const targetUser = await this.container.prisma.user.findUnique({
				where: { discordId: targetMember.user.id },
				select: { id: true },
			});

			if (!targetUser) {
				this.container.logger.warn(
					"[OrganizationalFormInteractionHandler#run] Author or target user was not found in database.",
				);

				return;
			}

			members[group] ||= [];
			members[group].push(targetMember);
		}

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
						members.CommandAssistance.map((x) => x.user.toString()),
					),
				},
				{
					name: "🏢 Comando Geral",
					value: this.#joinList(
						members.GeneralCommand.map((x) => x.user.toString()),
					),
				},
				{
					name: "📣 Ouvidoria",
					value: this.#joinList(
						members.Ombudsman.map((x) => x.user.toString()),
					),
				},
				{
					name: "🎤 Palco",
					value: this.#joinList(members.Stage.map((x) => x.user.toString())),
				},
				{
					name: "🏛️ Hall 1",
					value: this.#joinList(members.Hall1.map((x) => x.user.toString())),
				},
				{
					name: "🏛️ Hall 2",
					value: this.#joinList(members.Hall2.map((x) => x.user.toString())),
				},
				{
					name: "🏛️ Hall 3",
					value: this.#joinList(members.Hall3.map((x) => x.user.toString())),
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

		const authorExists = await this.container.prisma.user.findUnique({
			where: { discordId: interaction.user.id },
		});

		if (!authorExists)
			await interactionFromModal.editReply({
				content:
					"O formulário foi enviado, mas você não foi registrado, use `vincular` em si mesmo(a) para registrar-se.",
			});
		else await interactionFromModal.deleteReply();

		await this.container.prisma.user.update({
			where: { discordId: interaction.user.id },
			data: { reportsHistory: { push: new Date() } },
		});
	}

	public override onLoad() {
		schedule(
			"30 15 1,15 * *",
			async () => {
				const users = await this.container.prisma.user.findMany({
					where: { activeRenewal: null },
				});

				const filteredUsers = users.filter((user) => {
					return user.reportsHistory.every((report) => {
						const reportDate = new Date(report).getTime();
						const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;

						return reportDate < fifteenDaysAgo;
					});
				});

				const notificationChannel = await this.container.client.channels.fetch(
					ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_ORGANIZATIONAL,
				);

				if (notificationChannel?.isTextBased()) {
					await notificationChannel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(EmbedColors.Default)
								.setTitle("Relatório Organizacional - 15 dias")
								.setDescription(
									`**${
										filteredUsers.length
									}** usuários que tiveram o relatório pendente.\n\n${filteredUsers
										.map((user) => `- <@${user.discordId}>`)
										.join("\n")}`,
								),
						],
					});
				}
			},
			{ recoverMissedExecutions: true },
		);
	}

	#joinList(list: string[]) {
		if (list.length === 0) {
			return "N/D";
		}

		return `- ${list.join("\n- ")}`;
	}
}
