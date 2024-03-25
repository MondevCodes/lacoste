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
	Position = "Position",
	Promotion = "Promotion",
	Performance = "Performance",
	Orthography = "Orthography",
	PerformanceRate = "PerformanceRate",
	OrthographyRate = "OrthographyRate",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class EvaluationFormInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		const isAuthorized = await this.container.utilities.discord.hasPermission(
			{ category: "SECTOR", checkFor: "AVALIATIVO" },
			interaction.member as GuildMember,
		);

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Avaliação
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
							.setLabel("Posição em Sede")
							.setPlaceholder("Hall 1, Hall 2, Hall 3, etc.")
							.setCustomId(FeedbackInputIds.Position)
							.setStyle(TextInputStyle.Short)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Desempenho em Sede")
							.setPlaceholder("01/12/2024")
							.setCustomId(FeedbackInputIds.Performance)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Ortografia")
							.setPlaceholder("Descreva a ortografia do(a) avaliado(a).")
							.setCustomId(FeedbackInputIds.OrthographyRate)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Promovido Em")
							.setPlaceholder("01/12/2024")
							.setCustomId(FeedbackInputIds.Position)
							.setStyle(TextInputStyle.Short)
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
				content: `Não foi possível encontrar o perfil do(a) avaliado(a) "${result.Target}", verifique o nome e tente novamente.`,
			});

			return;
		}

		const habboProfile = habboProfileResult.unwrap();

		const performanceRate =
			await this.container.utilities.inquirer.awaitSelectMenu(i, {
				choices: Array.from({ length: 5 }, (_, i) => ({
					id: String(i + 1),
					label: String(i + 1),
					value: String(i + 1),
				})),
				question: "Nota para o desempenho do(a) avaliado(a)",
				placeholder: "Selecione uma opção (1-5)",
			});

		const orthographyRate =
			await this.container.utilities.inquirer.awaitSelectMenu(i, {
				choices: Array.from({ length: 5 }, (_, i) => ({
					id: String(i + 1),
					label: String(i + 1),
					value: String(i + 1),
				})),
				question: "Nota para a ortografia do(a) avaliado(a)",
				placeholder: "Selecione uma opção (1-5)",
			});

		const finalRate =
			(Number.parseInt(performanceRate) + Number.parseInt(orthographyRate)) / 2;

		const embed = new EmbedBuilder()
			.setTitle("Avaliação")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/${habboProfile.user.figureString}`,
			)
			.addFields([
				{ name: "Avaliado(a)", value: result.Target, inline: true },
				{ name: "Posição (Sede)", value: result.Position, inline: true },
				{ name: "Promovido (Data)", value: result.Promotion, inline: false },
				{
					name: "🎛️ Desempenho",
					value: result.Performance,
					inline: true,
				},
				{
					name: "📝 Ortografia",
					value: result.Orthography,
					inline: false,
				},
				{
					name: "Desempenho (Nota)",
					value: "⭐".repeat(Number.parseInt(performanceRate)),
					inline: true,
				},
				{
					name: "Ortografia (Nota)",
					value: "⭐".repeat(Number.parseInt(performanceRate)),
					inline: true,
				},
			])
			.setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.setFooter({
				text: `Nota ➜ ${finalRate}/5`,
			})
			.setColor(EmbedColors.Default);

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_EVALUATION,
		);

		if (channel === null || !channel.isTextBased()) {
			throw new Error(
				"Form evaluation channel not found or not a text channel.",
			);
		}

		await channel.send({
			embeds: [embed],
		});
	}
}
