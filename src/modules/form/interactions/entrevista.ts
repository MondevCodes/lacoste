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

enum FeedbackInputIds {
	Target = "Target",
	Clarification = "Clarification",
	Functionality = "Functionality",
	Compliment = "Compliment",
	Complaint = "Complaint",
	Additional = "Additional",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class InterviewFormInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		const isAuthorized = await this.container.utilities.discord.hasPermission(
			{ category: "SECTOR", checkFor: "AVALIATIVO" },
			interaction.member as GuildMember,
		);

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Entrevista
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
							.setLabel("Avaliado")
							.setPlaceholder("Discord (@Nick) ou Habbo (Nick).")
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel(
								"As informações sobre o novo cargo ficaram claras para você?",
							)
							.setPlaceholder("Responda com 'Sim' ou 'Não'.")
							.setCustomId(FeedbackInputIds.Clarification)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Você gostava da sua função anterior?")
							.setPlaceholder("Responda com 'Sim' ou 'Não'.")
							.setCustomId(FeedbackInputIds.Clarification)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel(
								"Gostaria de fazer algum elogio a respeito de sua promoção?",
							)
							.setPlaceholder("Responda com 'Sim' ou 'Não'.")
							.setCustomId(FeedbackInputIds.Compliment)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel(
								"Gostaria de fazer alguma reclamação a respeito de sua promoção?",
							)
							.setPlaceholder("Responda com 'Sim' ou 'Não'.")
							.setCustomId(FeedbackInputIds.Complaint)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Deseja acrescentar algo mais?")
							.setPlaceholder("Responda com 'Sim' ou 'Não'.")
							.setCustomId(FeedbackInputIds.Complaint)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),
					],
					listenInteraction: true,
					title: "Avaliação",
				},
			);

		const habboProfileResult = await this.container.utilities.habbo.getProfile(
			result.Target,
		);

		if (habboProfileResult.isErr()) {
			await i.reply({
				ephemeral: true,
				content: `Não foi possível encontrar o perfil do(a) entrevistado(a) "${result.Target}", verifique o nome e tente novamente.`,
			});

			return;
		}

		const habboProfile = habboProfileResult.unwrap();

		const embed = new EmbedBuilder()
			.setTitle("Avaliação")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/${habboProfile.user.figureString}`,
			)
			.addFields([
				{
					name: "As informações sobre o novo cargo ficaram claras para você?",
					value: result.Clarification,
				},
				{
					name: "Você gostava da sua função anterior?",
					value: result.Functionality,
				},
				{
					name: "Gostaria de fazer algum elogio a respeito de sua promoção?",
					value: result.Compliment ?? "N/A",
				},
				{
					name: "Gostaria de fazer alguma reclamação a respeito de sua promoção?",
					value: result.Complaint ?? "N/A",
				},
				{
					name: "Deseja acrescentar algo mais?",
					value: result.Additional ?? "N/A",
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
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_INTERVIEW,
		);

		if (channel === null || !channel.isTextBased()) {
			throw new Error(
				"Form interview channel not found or not a text channel.",
			);
		}

		await channel.send({
			embeds: [embed],
		});
	}
}
