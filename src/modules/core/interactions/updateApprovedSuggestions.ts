import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class UpdateApprovedSuggestionsInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (
      interaction.customId !== FormIds.adicionarSugestao &&
      interaction.customId !== FormIds.removerSugestao
    ) {
      return this.none();
    }

    const userTag = interaction.user.tag;

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[UpdateApprovedSuggestionsInteractionHandler#parse] ${userTag} tried to perform an action in a DM.`
      );

      return this.none();
    }

    const { members } =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const { roles } =
      "toJSON" in interaction.member
        ? interaction.member
        : await members.fetch(interaction.user.id);

    const isAuthorizedJob = roles.cache.has(
      ENVIRONMENT.JOBS_ROLES.DIRETOR_GERAL.id
    );

    const isAuthorizedSector =
      this.container.utilities.discord.hasPermissionByRole({
        checkFor: "FUNDAÇÃO" || "PRESIDÊNCIA" || "FEDERAÇÃO",
        category: "SECTOR",
        roles,
      });

    if (!isAuthorizedSector && !isAuthorizedJob) {
      await interaction.reply({
        content: `⛔ **Não autorizado**\nVocê precisa ser dos setores de: <@&${ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id}>, <@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>, <@&${ENVIRONMENT.SECTORS_ROLES.FEDERAÇÃO.id}> ou ter o cargo de <@&${ENVIRONMENT.JOBS_ROLES.DIRETOR_GERAL.id}> para acessar as funções "*Adicionar/Remover Sugestões Aprovadas*".`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return isAuthorizedSector || isAuthorizedJob ? this.some() : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const { interaction: interactionFromModal, result: modalResult } =
      await this.container.utilities.inquirer.awaitModal<
        "target" | "type" | "link" | "notes"
      >(interaction, {
        title:
          interaction.customId === FormIds.adicionarSugestao
            ? `Adicionar Sugestão Aprovada [Configuração]`
            : `Remover Sugestão Aprovada [Configuração]`,
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId("target")
            .setLabel("Membro")
            .setPlaceholder("Informe o Habbo (Nick)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("type")
            .setLabel(`Informe o tipo da Sugestão`)
            .setPlaceholder(
              `SM (Sugestões com Medalhas) ou SD (Sugestões Diversas)`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("link")
            .setLabel(`Insira o Link da Mensagem do Feedback`)
            .setPlaceholder(
              `https://discord.com/channels/788612423346683935/1016447495758426213/1368757073143140452`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("notes")
            .setLabel(`Observação`)
            .setPlaceholder(`Adicione suas observações a essa sugestão`)
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ],
      });

    const suggestionType = modalResult.type.toLocaleUpperCase();
    const invalidType = suggestionType != "SD" && suggestionType != "SM";
    let channel: TextChannel;
    try {
      channel = (await this.container.client.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.FEEDBACKS
      )) as TextChannel;
    } catch {
      channel = null;
    }
    const regexMsgId =
      /^https:\/\/discord\.com\/channels\/\d+\/1016447495758426213\/(\d+)$/;
    const matchMsgId = modalResult.link.match(regexMsgId);
    const msgId = matchMsgId ? matchMsgId[1] : null;
    const msgLink = msgId ? await channel.messages.fetch(msgId) : false;

    const rawName = modalResult.target
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const resultRaw: any = await this.container.prisma.$runCommandRaw({
      find: "User",
      filter: {
        habboName: {
          $regex: `^${rawName}$`,
          $options: "i",
        },
      },
      projection: {
        _id: 1,
        discordId: 1,
        habboName: 1,
        suggestions: 1,
      },
      limit: 1,
    });

    if (!resultRaw.cursor?.firstBatch.length || invalidType || !msgLink) {
      return await interactionFromModal.editReply({
        content: `⚠️  Informações Inválidas:
        ${
          !resultRaw.cursor?.firstBatch.length
            ? `\n❌ O usuário **${rawName}** não foi encontrado. Verifique se o nome está correto e tente novamente.`
            : ""
        } ${
          invalidType
            ? `\n❌ **Tipo de sugestão** está incorreta. Verifique se está inserindo corretamente **SM** ou **SD** no campo adequado.`
            : ""
        } ${
          !msgLink
            ? `\n❌ **Link do Feedback da Sugestão** está incorreto. Verifique se está inserindo corretamente, o link deve ser do canal <#${ENVIRONMENT.NOTIFICATION_CHANNELS.LOGS}>.`
            : ""
        } ${
          !channel ? `\n❌ Não foi possível acessar o canal de feedbacks.` : ""
        }`,
      });
    }

    const targetDB = resultRaw.cursor?.firstBatch[0];

    const confirmButton = new ButtonBuilder()
      .setCustomId("confirm")
      .setLabel("Confirmar")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    const confirmMessage = await interactionFromModal.editReply({
      content:
        `⚠️ **ATENÇÃO!** Confirme se as informações estão corretas:\n` +
        `\n- **Usuário alterado:** ${targetDB.habboName}` +
        `\n- **Ação:** ${
          interaction.customId === FormIds.adicionarSugestao
            ? "Adicionar"
            : "Remover"
        } Sugestão Aprovada` +
        `\n- **Tipo da Sugestão:** ${suggestionType}` +
        `\n- **Sugestão:** ${modalResult.link}` +
        `\n\nCaso esteja de acordo, clique em **Confirmar** para prosseguir ou **Cancelar** para abortar.`,
      components: [row],
    });

    try {
      const interaction = await confirmMessage.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interactionFromModal.member.user.id,
        time: 30000,
      });

      if (interaction.customId === "confirm") {
        await interaction.update({
          content: "🔄 Processando...",
          components: [],
        });
      } else {
        return await interaction.update({
          content: "❌ Operação cancelada.",
          components: [],
        });
      }
    } catch (error) {
      return await confirmMessage.edit({
        content: "⏰ Tempo esgotado. Operação cancelada.",
        components: [],
      });
    }

    const countSuggestions = await this.container.prisma.suggestions.groupBy({
      by: ["type"],
      _count: { _all: true },
      where: {
        authorId: targetDB._id.$oid,
        type: { in: ["SM", "SD"] },
      },
    });
    const suggestions = {
      SM: countSuggestions.find((c) => c.type === "SM")?._count._all ?? 0,
      SD: countSuggestions.find((c) => c.type === "SD")?._count._all ?? 0,
    };

    if (interaction.customId === FormIds.adicionarSugestao) {
      const existsSuggestion =
        await this.container.prisma.suggestions.findFirst({
          where: {
            msgLink: modalResult.link,
            type: { in: ["SD", "SM"] },
            authorId: targetDB._id.$oid,
          },
        });

      if (existsSuggestion)
        return await interactionFromModal.editReply({
          content: `⚠️  A sugestão que está tentando **criar já existe** para ***${targetDB.habboName}***.`,
        });

      await this.container.prisma.suggestions
        .create({
          data: {
            msgLink: modalResult.link,
            type: suggestionType,
            authorId: targetDB._id.$oid,
          },
        })
        .catch(async (error) => {
          this.container.logger.error({
            message: `[UpdateApprovedSuggestionsInteractionHandler#run] Ocorreu um erro ao "${interactionFromModal.member.user.username}" tentar criar a sugestão de tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`,
            error: error.message,
          });

          await interactionFromModal.editReply({
            content: `⚠️  Ocorreu um erro ao tentar **criar** uma sugestão. Por favor, contate os administradores do servidor.`,
          });

          throw new Error(
            `Ocorreu um erro durante a criação da sugestão: ${error.message}.`
          );
        });

      this.container.logger.info(
        `[UpdateApprovedSuggestionsInteractionHandler#run] Sugestão criada com sucesso no banco de dados por "${interactionFromModal.member.user.username}" do tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`
      );

      const targetMember = await interaction.guild.members.fetch(
        targetDB.discordId
      );

      if (!targetMember) {
        return await interactionFromModal.editReply({
          content: `⚠️  Ocorreu um erro ao tentar notificar ${targetDB.habboName} de sua sugestão aprovada, verifique se está ingresso no servidor.`,
        });
      }

      const dmChannel =
        targetMember.dmChannel || (await targetMember.createDM());

      await dmChannel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(EmbedColors.Success)
              .setTitle("Sugestão Aprovada! 📩✅")
              .setDescription(
                `🎉 **Parabéns! Uma sugestão ${suggestionType} foi aprovada e adicionada ao seu perfil de carreira.**
              
              Acesse a aba “***Verificações***” para consultá-la.
              É a **sua** sugestão que transforma a ***Lacoste***, estamos ansiosos para a sua próxima!
              
              ***#OrgulhoDeSerLacoste***`
              )
              .setFooter({
                text: interaction.user.displayName,
                iconURL: interaction.user.displayAvatarURL(),
              }),
          ],
        })
        .catch((error) => {
          this.container.logger.error({
            message: `[UpdateApprovedSuggestionsInteractionHandler#run] Tentativa de enviar feedback da sugestão do tipo "${suggestionType}" do membro "${interactionFromModal.user.displayName}" com o link "${modalResult.link}" no membro "${targetDB.habboName}" falhou.`,
            error: error.message,
          });
          return true;
        });
    } else {
      if (!suggestions[suggestionType]) {
        return await interactionFromModal.editReply({
          content: `🚫 Membro ***${targetDB.habboName}*** não possui sugestões aprovadas registradas no banco de dados.`,
        });
      }

      const existsSuggestion = await this.container.prisma.suggestions
        .findFirst({
          where: {
            msgLink: modalResult.link,
            type: suggestionType,
            authorId: targetDB._id.$oid,
          },
        })
        .catch(async (error) => {
          await interactionFromModal.editReply({
            content: `❌ Não foi encontrado nenhuma sugestão igual a que está tentando deletar ou ocorreu um erro inesperado.`,
          });

          throw new Error(
            `Ocorreu um erro durante a verificação da existência da sugestão: ${error.message}.`
          );
        });

      await this.container.prisma.suggestions
        .delete({
          where: {
            id: existsSuggestion.id,
          },
        })
        .catch(async (error) => {
          this.container.logger.error({
            message: `[UpdateApprovedSuggestionsInteractionHandler#run] Tentativa de deletar sugestão do tipo "${suggestionType}" do membro "${interactionFromModal.user.displayName}" com o link "${modalResult.link}" no membro "${targetDB.habboName}" falhou.`,
            error: error.message,
          });

          await interactionFromModal.editReply({
            content: `⚠️  Ocorreu um erro ao tentar **deletar** uma sugestão. Por favor, contate os administradores do servidor.`,
          });

          throw new Error(
            `Ocorreu um erro durante o delete da sugestão: ${error.message}.`
          );
        });

      this.container.logger.info(
        `[UpdateApprovedSuggestionsInteractionHandler#run] Sugestão deletada com sucesso do banco de dados por "${interactionFromModal.member.user.username}" do tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`
      );
    }

    const notificationChannel = (await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.LOGS
    )) as TextChannel;

    await notificationChannel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Info)
            .setTitle(
              interaction.customId === FormIds.adicionarSugestao
                ? "Sugestão Aprovada ✅"
                : "Sugestão Removida 🗑️"
            )
            .setAuthor({
              name: `Aprovado por ${interactionFromModal.user.displayName}`,
              iconURL: interactionFromModal.user.displayAvatarURL(),
            })
            .addFields([
              {
                name: "📇 Autor da Sugestão",
                value: `${targetDB.habboName ?? `@${targetDB.discordId}`}`,
                inline: true,
              },
              {
                name: `🛡️ Tipo da Sugestão`,
                value: `${
                  suggestionType === "SM"
                    ? "Sugestão com Medalha 🏅"
                    : "Sugestão Diversa 🎨"
                }`,
                inline: true,
              },
              {
                name: "📩 Sugestão",
                value: `${modalResult.link}`,
                inline: true,
              },
              {
                name: `🗳️ 🔄 Sugestões ${suggestionType} (Anterior)`,
                value: `${
                  interaction.customId === FormIds.adicionarSugestao
                    ? suggestionType === "SM"
                      ? suggestions.SM > 0
                        ? suggestions.SM - 1
                        : 0
                      : suggestions.SM > 0
                      ? suggestions.SD - 1
                      : 0
                    : suggestionType === "SM"
                    ? suggestions.SM > 0
                      ? suggestions.SM + 1
                      : 0
                    : suggestions.SM > 0
                    ? suggestions.SD + 1
                    : 0
                }`,
                inline: true,
              },
              {
                name: `🗳️ ✅ Sugestões ${suggestionType} (Atualizado)`,
                value: `${
                  suggestionType === "SM" ? suggestions.SM : suggestions.SD
                }`,
                inline: true,
              },
              {
                name: "🗒️ Observações",
                value: modalResult.notes ? modalResult.notes : `*Nenhuma*`,
                inline: false,
              },
            ]),
        ],
      })
      .catch((error) => {
        this.container.logger.error({
          message: `[UpdateApprovedSuggestionsInteractionHandler#run] Tentativa de enviar o log da sugestão do tipo "${suggestionType}" do membro "${interactionFromModal.user.displayName}" com o link "${modalResult.link}" no membro "${targetDB.habboName}" falhou.`,
          error: error.message,
        });
      });

    return await interactionFromModal.editReply({
      content: `📩 ✅ Sugestão Aprovada ${
        interaction.customId === FormIds.adicionarSugestao
          ? "**adicionada** ao"
          : "**removida** do"
      } perfil de ***${targetDB.habboName}*** com sucesso.`,
    });
  }
}
