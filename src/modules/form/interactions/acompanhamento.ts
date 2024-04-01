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

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum FeedbackInputIds {
	Target = "Target",
	Promoted = "Promoted",
	Performance = "Performance",
	PerformanceRate = "PerformanceRate",
	NeedsMoreFollowUp = "NeedsMoreFollowUp",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class FollowUpFormInteractionHandler extends InteractionHandler {
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
			checkFor: "DIRETORIA",
			roles: member.roles,
		});

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Acompanhamento
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Promotor")
							.setPlaceholder("Se desejar, adicione informações extras aqui.")
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Promovidos")
							.setPlaceholder("Lista de @Nicks ou Nicks separados por virgula.")
							.setCustomId(FeedbackInputIds.Promoted)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Nota de desempenho")
							.setPlaceholder("Ex.: 1, 2, 3, 4 ou 5")
							.setCustomId(FeedbackInputIds.PerformanceRate)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Motivo da nota")
							.setPlaceholder("Ex.: Muito bom")
							.setCustomId(FeedbackInputIds.Performance)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Precisa de mais acompanhamento?")
							.setPlaceholder("Ex.: Sim ou Não")
							.setCustomId(FeedbackInputIds.NeedsMoreFollowUp)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Acompanhamento",
				},
			);

		const embed = new EmbedBuilder()
			.setTitle("Acompanhamento")
			.addFields([
				{
					name: "Promotor",
					value: result.Target.length > 0 ? result.Target : "N/A",
					inline: true,
				},
				{
					name: "Promovidos",
					value: result.Target.length > 0 ? result.Promoted : "N/A",
					inline: true,
				},
				{
					name: "Nota de Desempenho",
					value: "⭐".repeat(Number(result.Target)) || "N/A",
					inline: true,
				},
				{
					name: "Motivo da Nota",
					value: result.Target.length > 0 ? result.Performance : "N/A",
					inline: true,
				},
				{
					name: "Precisa de mais acompanhamento?",
					value: result.Target.length > 0 ? result.NeedsMoreFollowUp : "N/A",
					inline: true,
				},
			])
			.setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.setColor(EmbedColors.Default);

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FOLLOWUP,
		);

		if (!channel?.isTextBased()) {
			throw new Error("Form followUp channel not found or not a text channel.");
		}

		await channel.send({
			embeds: [embed],
		});

		await i.deleteReply();
	}
}
