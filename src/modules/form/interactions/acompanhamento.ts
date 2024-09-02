import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes, Result,
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
import { MarkdownCharactersRegex } from "$lib/constants/regexes";

enum FeedbackInputIds {
	Target = "Target",
	Promoted = "Promoted",
	Performance = "Performance",
	PerformanceRate = "PerformanceRate",
	// NeedsMoreFollowUp = "NeedsMoreFollowUp",
	QuestionOne = "QuestionOne",
	QuestionTwo = "QuestionTwo",
	QuestionThree = "QuestionThree",
	QuestionFour = "QuestionFour",
	QuestionFive = "QuestionFive",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

let habboInteractionName: string | undefined = undefined;

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
			checkFor: "ADMINISTRATIVO",
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
							.setLabel("Apresentou a sede da Lacoste, designadamente, Hall 1, Hall 2, Hall 3, Palco e Ouvidoria, e mostrou sobre as funções referentes ao cargo proposto.")
							.setPlaceholder("Escolha a nota de 0 a 1")
							.setCustomId(FeedbackInputIds.QuestionOne)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Tirou dúvidas do participante e questionou sobre o entendimento das diversas funções.")
							.setPlaceholder("Escolha a nota de 0 a 1")
							.setCustomId(FeedbackInputIds.QuestionTwo)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Fez uma breve simulação do local onde o colaborador desempenhará o seu papel, também aplicando a prática dos comandos referente aos locais de seu funcionamento.")
							.setPlaceholder("Escolha a nota de 0 a 1")
							.setCustomId(FeedbackInputIds.QuestionThree)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Apresentou sobre todas as regras gerais da Lacoste e soube explicar bem sobre o assunto.")
							.setPlaceholder("Escolha a nota de 0 a 1")
							.setCustomId(FeedbackInputIds.QuestionFour)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Trouxe conhecimento extra do funcionamento da sede e reforçou quanto ao pagamento semanal, também citando sobre o Discord, outros comandos na sede, e ou sobre as presenças referente aos relatórios para o iniciante.")
							.setPlaceholder("Escolha a nota de 0 a 1")
							.setCustomId(FeedbackInputIds.QuestionFive)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						// new TextInputBuilder()
						// 	.setLabel("Nota de desempenho")
						// 	.setPlaceholder("Ex.: 1, 2, 3, 4 ou 5")
						// 	.setCustomId(FeedbackInputIds.PerformanceRate)
						// 	.setStyle(TextInputStyle.Short)
						// 	.setRequired(true),

						new TextInputBuilder()
							.setLabel("Observação")
							.setPlaceholder("Ex.: Muito bom")
							.setCustomId(FeedbackInputIds.Performance)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						// new TextInputBuilder()
						// 	.setLabel("Precisa de mais acompanhamento?")
						// 	.setPlaceholder("Ex.: Sim ou Não")
						// 	.setCustomId(FeedbackInputIds.NeedsMoreFollowUp)
						// 	.setStyle(TextInputStyle.Short)
						// 	.setRequired(true),
					],
					listenInteraction: true,
					title: "Acompanhamento",
				},
			);

		const { member: targetMember, habbo: targetHabbo } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				result.Target,
			);

		if (!targetHabbo) {
			await i.editReply({
				content:
					"Nenhum membro encontrado com esse nome, por favor tente novamente.",
			});

			return;
		}

		const targetJobId =
			targetMember &&
			this.container.utilities.discord.inferHighestJobRole(
				targetMember.roles.cache.map((r) => r.id),
			);

		const targetJobRole =
			targetJobId && (await targetMember.guild.roles.fetch(targetJobId));

		if (!targetJobRole) {
			await i.editReply({
				content:
					"Nenhum cargo de trabalho encontrado, por favor tente novamente.",
			});

			return;
		}

    const authorResult =
    (await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true,
      ),
    ));

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

    const finalRate = result.QuestionOne + result.QuestionTwo + result.QuestionThree + result.QuestionFour + result.QuestionFive

		const embed = new EmbedBuilder()
			.setTitle("Acompanhamento")
      .setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.addFields([
        {
          name: "👤 Autor",
          value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
        },
				{
					name: "🧑‍🏫 Promotor",
					value: `${targetHabbo.name.replaceAll(
						MarkdownCharactersRegex,
						"\\$&",
					)} // ${targetJobRole.toString()}`,
					inline: true,
				},
				{
					name: "🏆 Nota de Desempenho",
					value: finalRate.replace(/[^0-5]/g, "") || "N/A",
					inline: true,
				},
				{
					name: "🗒️ Observação",
					value: result.Performance,
					inline: true,
				},
			])
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
