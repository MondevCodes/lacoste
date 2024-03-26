import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	type ButtonInteraction,
	GuildMember,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { merge } from "remeda";

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
		const { result: resultPartial, interaction: i } =
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
					],
					listenInteraction: true,
					title: "Formulário Organizacional",
				},
			);

		const choices = await this.container.utilities.inquirer.awaitSelectMenu(i, {
			minValues: 1,
			maxValues: 7,
			choices: [
				{
					id: OrganizationalFormInputIds.CommandAssistance,
					label: "Auxilio do Comando",
					emoji: "👥",
				},
				{
					id: OrganizationalFormInputIds.GeneralCommand,
					label: "Comando Geral",
					emoji: "🏢",
				},
				{
					id: OrganizationalFormInputIds.Ombudsman,
					label: "Ouvidoria",
					emoji: "📣",
				},
				{
					id: OrganizationalFormInputIds.Stage,
					label: "Palco",
					emoji: "🎤",
				},
				{
					id: OrganizationalFormInputIds.Hall1,
					label: "Hall 1",
					emoji: "🏛️",
				},
				{
					id: OrganizationalFormInputIds.Hall2,
					label: "Hall 2",
					emoji: "🏛️",
				},
				{
					id: OrganizationalFormInputIds.Hall3,
					label: "Hall 3",
					emoji: "🏛️",
				},
			],
			placeholder: "Selecione os Locais",
			question: "Em quais áreas você marcou presença?",
		});

		const result = merge(
			resultPartial,
			(
				Object.keys(
					OrganizationalFormInputIds,
				) as (keyof typeof OrganizationalFormInputIds)[]
			).reduce(
				(acc, key) =>
					merge(acc, {
						[key]: choices.find((c) => c === OrganizationalFormInputIds[key])
							? "Sim"
							: "Não",
					}),
				{},
			),
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
					value: result[OrganizationalFormInputIds.CommandAssistance],
				},
				{
					name: "🏢 Comando Geral",
					value: result[OrganizationalFormInputIds.GeneralCommand],
				},
				{
					name: "📣 Ouvidoria",
					value: result[OrganizationalFormInputIds.Ombudsman],
				},
				{
					name: "🎤 Palco",
					value: result[OrganizationalFormInputIds.Stage],
				},
				{
					name: "🏛️ Hall 1",
					value: result[OrganizationalFormInputIds.Hall1],
				},
				{
					name: "🏛️ Hall 2",
					value: result[OrganizationalFormInputIds.Hall2],
				},
				{
					name: "🏛️ Hall 3",
					value: result[OrganizationalFormInputIds.Hall3],
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

		await i.deleteReply();
	}
}
