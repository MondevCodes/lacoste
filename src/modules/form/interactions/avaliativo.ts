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
		if (!interaction.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const guild = await this.container.utilities.discord.getGuild();

		const member = !(interaction.member instanceof GuildMember)
			? await guild.members.fetch(interaction.member.user.id)
			: interaction.member;

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			category: "SECTOR",
			checkFor: "AVALIATIVO",
			roles: member.roles,
		});

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
							.setLabel("Avaliado (Discord ou Habbo)")
							.setPlaceholder(
								"Informe ID do Discord (@Nick) ou do Habbo (Nick).",
							)
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
							.setPlaceholder("Descreva o desempenho do(a) avaliado(a).")
							.setCustomId(FeedbackInputIds.Performance)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Ortografia")
							.setPlaceholder("Descreva a ortografia do(a) avaliado(a).")
							.setCustomId(FeedbackInputIds.Orthography)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(false),

						new TextInputBuilder()
							.setLabel("Promovido Em")
							.setPlaceholder("01/12/2024")
							.setCustomId(FeedbackInputIds.Promotion)
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
			await i.followUp({
				ephemeral: true,
				content: `Não foi possível encontrar o perfil do(a) avaliado(a) "${result.Target}", verifique o nome e tente novamente.`,
			});

			return;
		}

		const habboProfile = habboProfileResult.unwrap();

		const [performanceRate] =
			await this.container.utilities.inquirer.awaitSelectMenu(i, {
				choices: [
					{ id: "1", label: "Muito Ruim", value: "1", emoji: "1️⃣" },
					{ id: "2", label: "Ruim", value: "2", emoji: "2️⃣" },
					{ id: "3", label: "Regular", value: "3", emoji: "3️⃣" },
					{ id: "4", label: "Bom", value: "4", emoji: "4️⃣" },
					{ id: "5", label: "Excelente", value: "5", emoji: "5️⃣" },
				],
				question: "Nota para o desempenho do(a) avaliado(a)",
				placeholder: "Selecione uma opção (1-5)",
			});

		const [orthographyRate] =
			await this.container.utilities.inquirer.awaitSelectMenu(i, {
				choices: [
					{ id: "1", label: "Muito Ruim", value: "1", emoji: "1️⃣" },
					{ id: "2", label: "Ruim", value: "2", emoji: "2️⃣" },
					{ id: "3", label: "Regular", value: "3", emoji: "3️⃣" },
					{ id: "4", label: "Bom", value: "4", emoji: "4️⃣" },
					{ id: "5", label: "Excelente", value: "5", emoji: "5️⃣" },
				],
				question: "Nota para a ortografia do(a) avaliado(a)",
				placeholder: "Selecione uma opção (1-5)",
			});

		const finalRate =
			(Number.parseInt(performanceRate) + Number.parseInt(orthographyRate)) / 2;

		const embed = new EmbedBuilder()
			.setTitle("Avaliação")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboProfile.user.figureString}&size=b`,
			)
			.addFields([
				{ name: "Avaliado(a)", value: result.Target },
				{ name: "Posição (Sede)", value: result.Position },
				{ name: "Promovido (Data)", value: result.Promotion },
				{ name: "Desempenho", value: result.Performance },
				{ name: "Ortografia", value: result.Orthography },
				{
					name: "Desempenho (Nota)",
					value: "⭐".repeat(Number.parseInt(performanceRate)),
				},
				{
					name: "Ortografia (Nota)",
					value: "⭐".repeat(Number.parseInt(performanceRate)),
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

		await i.deleteReply();
	}
}
