import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { MarkdownCharactersRegex } from "$lib/constants/regexes";

enum FeedbackInputIds {
	Target = "Target",
	Description = "Description",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class SuggestionFormInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		return interaction.customId === FormIds.Sugestão
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result, interaction: interactionFromModal } =
			await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Autor da Sugestão")
							.setPlaceholder(
								"Informe ID do Discord (@Nick) ou do Habbo (Nick).",
							)
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Descrição")
							.setPlaceholder("Ex.: Novos recursos do servidor.")
							.setCustomId(FeedbackInputIds.Description)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Sugestão",
				},
			);

		const { member: targetMember, habbo: targetHabbo } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				result.Target,
			);

		if (!interactionFromModal.deferred) {
			await interaction.deferReply({ ephemeral: true });
		}

		if (!targetMember) {
			await interactionFromModal.editReply({
				content: "Não foi possível encontrar o usuário informado.",
			});

			return;
		}

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const targetHighestSectorId =
			this.container.utilities.discord.inferHighestJobRole(
				targetMember.roles.cache.map((r) => r.id),
			);

		const targetHighestSector = targetHighestSectorId
			? await guild.roles.fetch(targetHighestSectorId)
			: null;

		const embed = new EmbedBuilder()
			.setTitle("Sugestão")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`,
			)
			.addFields([
				{
					name: "Autor(a)",
					value: `${
						targetHabbo?.name.replaceAll(MarkdownCharactersRegex, "\\$&") ??
						result.Target
					} // ${targetMember.toString()}`,
				},
				{
					name: "Diretor(a)",
					value: interaction.user.toString(),
				},
				{
					name: "Cargo",
					value: targetHighestSector?.name ?? "N/D",
				},
				{
					name: "Descrição",
					value: result.Description,
				},
			])
			.setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.setColor(EmbedColors.Default);

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_SUGGESTION,
		);

		if (channel === null || !channel.isTextBased()) {
			throw new Error(
				"Form evaluation channel not found or not a text channel.",
			);
		}

		await channel.send({
			embeds: [embed],
		});

		await interactionFromModal.deleteReply();
	}
}
