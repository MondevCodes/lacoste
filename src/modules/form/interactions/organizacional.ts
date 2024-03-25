import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	type ButtonInteraction,
	type GuildMember,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

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
		const isAuthorized = await this.container.utilities.discord.hasPermission(
			{ category: "SECTOR", checkFor: "PROMOCIONAL" },
			interaction.member as GuildMember,
		);

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Organizacional
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result } =
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
							.setLabel("Hall 1")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.Hall1)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Hall 2")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.Hall2)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Hall 3")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.Hall3)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Palco")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.Stage)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Comando Geral")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.GeneralCommand)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Auxílio do Comando")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.CommandAssistance)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Ouvidoria")
							.setPlaceholder("Presença de colaboradores (Sim/Não)")
							.setCustomId(OrganizationalFormInputIds.Ombudsman)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Quantidade")
							.setPlaceholder("Total de colaboradores presentes")
							.setCustomId(OrganizationalFormInputIds.Total)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Posição no TOP")
							.setPlaceholder("Ex.: 1º Lugar")
							.setCustomId(OrganizationalFormInputIds.TopPosition)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Formulário Organizacional",
				},
			);

		const embed = new EmbedBuilder()
			.setTitle("Formulário Organizacional")
			.setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.addFields(
				{
					name: "Horário",
					value: result[OrganizationalFormInputIds.Time],
				},
				{
					name: "Hall 1",
					value: result[OrganizationalFormInputIds.Hall1],
				},
				{
					name: "Hall 2",
					value: result[OrganizationalFormInputIds.Hall2],
				},
				{
					name: "Hall 3",
					value: result[OrganizationalFormInputIds.Hall3],
				},
				{
					name: "Palco",
					value: result[OrganizationalFormInputIds.Stage],
				},
				{
					name: "Comando Geral",
					value: result[OrganizationalFormInputIds.GeneralCommand],
				},
				{
					name: "Auxílio do Comando",
					value: result[OrganizationalFormInputIds.CommandAssistance],
				},
				{
					name: "Ouvidoria",
					value: result[OrganizationalFormInputIds.Ombudsman],
				},
				{
					name: "Quantidade",
					value: result[OrganizationalFormInputIds.Total],
				},
				{
					name: "Posição no TOP",
					value: result[OrganizationalFormInputIds.TopPosition],
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
	}
}
