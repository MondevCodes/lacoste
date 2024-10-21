import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
	Result,
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
import { MarkdownCharactersRegex } from "$lib/constants/regexes";

enum FeedbackInputIds {
	Target = "Target",
	Author = "Author",
	Opinion = "Opinion",
	Rules = "Rules",
	Functions = "Functions",
	Servs = "Servs",
	Feedback = "Feedback",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class InterviewFormInteractionHandler extends InteractionHandler {
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
							.setLabel("Entrevistado")
							.setPlaceholder("Informe o nickname no Habbo.")
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Entrevistador")
							.setPlaceholder("Informe o nickname no Habbo.")
							.setCustomId(FeedbackInputIds.Author)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("O que está achando da Lacoste?")
							.setCustomId(FeedbackInputIds.Opinion)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Você sabe as regras da Lacoste? Cite uma.")
							.setCustomId(FeedbackInputIds.Rules)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Você tem ciência de suas funções? Descreva.")
							.setCustomId(FeedbackInputIds.Functions)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Entrevista",
				},
			);

      const { result: resultPartial, interaction: interactionFromModal } =
      await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
            .setLabel("Conhece o serv. do Market. e o de Condutas?")
            .setCustomId(FeedbackInputIds.Servs)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),

            new TextInputBuilder()
            .setLabel("Como podemos melhorar sua experiência?")
            .setCustomId(FeedbackInputIds.Feedback)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
          ],
          listenInteraction: true,
          title: "Entrevista",
          startButtonLabel: "Continuar",
        }
      );

		if (!i.deferred) {
			await i.deferReply({ ephemeral: true }).catch(() => null);
		}

		if (!interactionFromModal.deferred) {
			await interactionFromModal.deferReply({ ephemeral: true }).catch(() => null);
		}

    const targetHabbo = (
      await this.container.utilities.habbo.getProfile(result.Target)
    ).unwrapOr(undefined);

		if (!targetHabbo) {
			await i.reply({
				ephemeral: true,
				content: "Não foi possível encontrar o usuário avaliado no Habbo, verifique se a conta do mesmo no jogo está como pública.",
			});

			return;
		}

		// ---

		const inferredAuthor = await Result.fromAsync(
			this.container.utilities.habbo.inferTargetGuildMember(result.Author),
		);

		if (inferredAuthor.isErr()) {
			await i.editReply({
				content: "Não foi possível encontrar o autor informado.",
			});

			return;
		}

		const { habbo: authorHabbo } = inferredAuthor.unwrapOr(null);

		if (!authorHabbo) {
			await i.editReply({
				content: "Não foi possível encontrar o autor informado.",
			});

			return;
		}

		const embed = new EmbedBuilder()
			.setTitle("Entrevista")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`,
			)
			.addFields([
				{
					name: "Entrevistado",
					value: `${targetHabbo.name.replaceAll(
						MarkdownCharactersRegex,
						"\\$&",
					)}`,
				},
				{
					name: "Entrevistador",
					value: `${authorHabbo.name.replaceAll(
						MarkdownCharactersRegex,
						"\\$&",
					)}`,
				},
				{
					name: "O que está achando da Lacoste?",
					value: result.Opinion,
				},
				{
					name: "Você sabe as regras da Lacoste? Cite uma.",
					value: result.Rules,
				},
				{
					name: "Você tem ciência de suas funções? Descreva.",
					value: result.Functions,
				},
				{
					name: "Conhece o serv. do Market. e o de Condutas?",
					value: result.Servs,
				},
				{
					name: "Como podemos melhorar sua experiência?",
					value: resultPartial.Feedback,
				},
			])
			.setAuthor({
				name: authorHabbo.name ?? `@${interaction.user.tag}`,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.setColor(EmbedColors.LalaRed);

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

		await i.deleteReply().catch(() => null);

    await interactionFromModal
    .deleteReply()
    .catch(() =>
      this.container.logger.error(
        "[Form] Couldn't delete reply interactionFromModal."
      )
    );
	}
}
