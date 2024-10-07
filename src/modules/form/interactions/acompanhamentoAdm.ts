import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  Result,
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

import { merge } from "remeda";

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
  QuestionSix = "QuestionSix",
  QuestionSeven = "QuestionSeven",
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

    return interaction.customId === FormIds.AcompanhamentoAdm
      ? this.some()
      : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const guildCache = await this.container.utilities.discord.getGuild();

    const member = !(interaction.member instanceof GuildMember)
      ? await guildCache.members.fetch(interaction.user.id)
      : interaction.member;

    const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
      category: "JOB",
      checkFor: "INTENDENTE",
      roles: member.roles,
    });

    if (!isAuthorized) {
      await interaction.reply({
        content: `Não autorizado. Você precisa ter PELO MENOS o cargo de <@&1173398360623955969> para acessar a função "Acompanhar Administração".`,
        ephemeral: true,
      });

      return;
    }

    const { result: resultPartial, interaction: interactionFromModal } =
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
              .setLabel("Encaminhou o colaborador a criar a sua tag")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionOne)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Explicou os passos para preparar uma promoção")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionTwo)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Explicou sobre os convites aos servidores")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionThree)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Explicou sobre as promoções manuais")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionFour)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ],
          listenInteraction: true,
          title: "Acompanhamento de Administração",
        }
      );
    const { result: resultPartial2, interaction: i } =
      await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
        interactionFromModal,
        {
          inputs: [
            new TextInputBuilder()
              .setLabel("Explicou as funções do CG e do seu Auxílio")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionFive)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Explicou como realizar relatórios presenciais")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionSix)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Apresentou as regras para a abertura da sede")
              .setPlaceholder("Atribua uma nota de 0 a 1")
              .setCustomId(FeedbackInputIds.QuestionSeven)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Observação")
              .setPlaceholder("Ex.: Muito bom")
              .setCustomId(FeedbackInputIds.Performance)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ],
          title: "Acompanhamento de Administração",
          startButtonLabel: "Continuar",
        }
      );

    const result = merge(resultPartial, resultPartial2);

    const { member: targetMember, habbo: targetHabbo } =
      await this.container.utilities.habbo.inferTargetGuildMember(
        result.Target
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
        targetMember.roles.cache.map((r) => r.id)
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

    const authorResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true
      )
    );

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

    const finalRate =
      Number.parseInt(result.QuestionOne) +
      Number.parseInt(result.QuestionTwo) +
      Number.parseInt(result.QuestionThree) +
      Number.parseInt(result.QuestionFour) +
      Number.parseInt(result.QuestionFive) +
      Number.parseInt(result.QuestionSix) +
      Number.parseInt(result.QuestionSeven);

    this.container.logger.info(
      `[AcompanhamentoAdmInteractionHandler#run] finalRate: ${finalRate}`
    );

    const embed = new EmbedBuilder()
      .setTitle("Acompanhamento de Administração")
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
            "\\$&"
          )} // ${targetJobRole.toString()}`,
          inline: true,
        },
        {
          name: "🖊️ Encaminhou o colaborador a criar a sua tag",
          value:
            Number.parseInt(result.QuestionOne) < 2 &&
            Number.parseInt(result.QuestionOne) >= 0
              ? `${result.QuestionOne}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Explicou os passos para preparar uma promoção",
          value:
            Number.parseInt(result.QuestionTwo) < 2 &&
            Number.parseInt(result.QuestionTwo) >= 0
              ? `${result.QuestionTwo}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Explicou sobre os convites aos servidores",
          value:
            Number.parseInt(result.QuestionThree) < 2 &&
            Number.parseInt(result.QuestionThree) >= 0
              ? `${result.QuestionThree}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Explicou sobre as promoções manuais",
          value:
            Number.parseInt(result.QuestionFour) < 2 &&
            Number.parseInt(result.QuestionFour) >= 0
              ? `${result.QuestionFour}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Explicou as funções do CG e do seu Auxílio",
          value:
            Number.parseInt(result.QuestionFive) < 2 &&
            Number.parseInt(result.QuestionFive) >= 0
              ? `${result.QuestionFive}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Explicou como realizar relatórios presenciais",
          value:
            Number.parseInt(result.QuestionSix) < 2 &&
            Number.parseInt(result.QuestionSix) >= 0
              ? `${result.QuestionSix}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🖊️ Apresentou as regras para a abertura da sede",
          value:
            Number.parseInt(result.QuestionSeven) < 2 &&
            Number.parseInt(result.QuestionSeven) >= 0
              ? `${result.QuestionSeven}/1`
              : "N/A",
          inline: true,
        },
        {
          name: "🏆 Nota de Desempenho",
          value: finalRate < 8 && finalRate >= 0 ? `${finalRate}/7` : "N/A",
          inline: true,
        },
        {
          name: "🗒️ Observação",
          value: result.Performance,
          inline: true,
        },
      ])
      .setColor(EmbedColors.LalaRed)
      .setThumbnail(
        `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
      );

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

    const channel = await guild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FOLLOWUP
    );

    const promotionChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_PROMOTIONS
    );

    if (!channel?.isTextBased() || !promotionChannel?.isTextBased()) {
      throw new Error(
        "Form followUp or promotion channel not found or not a text channel."
      );
    }

    await channel.send({
      embeds: [embed],
    });

    await promotionChannel.send({
      embeds: [
        new EmbedBuilder()
          .setDescription("### Simulação de Promoção\n\n")
          .setAuthor({
            name: targetMember.user.tag,
            iconURL: targetMember.user.displayAvatarURL(),
          })
          .addFields([
            {
              name: "👤 Promotor ",
              value: `${targetHabbo.name ?? `@${targetMember.user.tag}`}`,
            },
            {
              name: "📝 Cargo Anterior",
              value: `<@&${ENVIRONMENT.JOBS_ROLES.COORDENADOR.id}>`,
              inline: false,
            },
            {
              name: "📗 Cargo Promovido",
              value: `<@&${ENVIRONMENT.JOBS_ROLES.SUB_GERENTE.id}>`,
            },
            {
              name: "🔍 Supervisionado por",
              value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
            },
          ])
          .setColor(EmbedColors.Success)
          .setThumbnail(
            `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
          ),
      ],
    });

    await i
      .deleteReply()
      .catch(() =>
        this.container.logger.error(
          "[FormAcompanhamentoAdm] Couldn't delete reply."
        )
      );

    await interactionFromModal
      .deleteReply()
      .catch(() =>
        this.container.logger.error(
          "[FormAcompanhamentoAdm] Couldn't delete reply."
        )
      );
  }
}
