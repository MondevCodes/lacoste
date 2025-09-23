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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const pendingRequests = new Map<string, number>();

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
        checkFor: ["FUNDAÇÃO", "PRESIDÊNCIA", "FEDERAÇÃO"],
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
    if (interaction.customId === FormIds.adicionarSugestao) {
      if (pendingRequests.has(interaction.user.id)) {
        const startTime = pendingRequests.get(interaction.user.id)!;
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.ceil((60 * 1000 - elapsedTime) / 1000);

        return await interaction.reply({
          content: `⏳ Você já tem uma criação de uma sugestão aprovada em andamento. Aguarde **${remainingTime}s** para evitar duplicidades antes de tentar novamente.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      pendingRequests.set(interaction.user.id, Date.now());
    }

    const inputs = [
      new TextInputBuilder()
        .setCustomId("target")
        .setLabel("Membro")
        .setPlaceholder("Informe o Habbo (Nick)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true),

      new TextInputBuilder()
        .setCustomId("notes")
        .setLabel("Observação")
        .setPlaceholder("Adicione suas observações a essa sugestão")
        .setStyle(TextInputStyle.Short)
        .setRequired(false),
    ];

    if (interaction.customId === FormIds.adicionarSugestao) {
      inputs.splice(
        1,
        0,
        new TextInputBuilder()
          .setCustomId("type")
          .setLabel("Informe o tipo da Sugestão")
          .setPlaceholder(
            "SM (Sugestões com Medalhas) ou SD (Sugestões Diversas)"
          )
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setMinLength(2)
          .setRequired(true)
      );
      inputs.splice(
        2,
        0,
        new TextInputBuilder()
          .setCustomId("link")
          .setLabel("Insira o Link da Mensagem do Feedback")
          .setPlaceholder("https://discord.com/channels/123/456/7890")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      );
    } else {
      inputs.splice(
        1,
        0,
        new TextInputBuilder()
          .setCustomId("suggestionId")
          .setLabel("Insira o ID da Sugestão")
          .setPlaceholder(
            "ID é adquirido no comando /verificar perfil sugestão. Ex: 3"
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      );
    }

    const { interaction: interactionFromModal, result: modalResult } =
      await this.container.utilities.inquirer.awaitModal<
        "target" | "type" | "link" | "suggestionId" | "notes"
      >(interaction, {
        title:
          interaction.customId === FormIds.adicionarSugestao
            ? "Adicionar Sugestão Aprovada [Configuração]"
            : "Remover Sugestão Aprovada [Configuração]",
        listenInteraction: true,
        inputs,
      });

    let suggestionId = modalResult.suggestionId;
    let suggestionTitle: string = null;

    let suggestionType: "SM" | "SD" = modalResult.type
      ? (modalResult.type.toLocaleUpperCase() as "SM" | "SD")
      : null;
    const invalidType = !modalResult.suggestionId
      ? suggestionType != "SD" && suggestionType != "SM"
      : false;
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
    const matchMsgId = modalResult.link
      ? modalResult.link.match(regexMsgId)
      : null;
    const msgId = matchMsgId ? matchMsgId[1] : null;
    const msgLink = msgId ? await channel.messages.fetch(msgId) : false;

    let suggestionsTheme = null;

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
      },
      limit: 1,
    });

    if (
      !resultRaw.cursor?.firstBatch.length ||
      invalidType ||
      (!msgLink && modalResult.link)
    ) {
      pendingRequests.delete(interaction.user.id);
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
          !msgLink && modalResult.link
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

    if (interaction.customId === FormIds.adicionarSugestao) {
      const themes = [
        "FINANCEIRO",
        "DISCORD",
        "AUTOMATIZAÇÃO",
        "EVENTOS",
        "ORGANIZACIONAL",
        "CAPACITAÇÃO",
        "SEDE",
        "NORMATIVAS",
        "RECOMPENSAS",
        "HIERARQUIA",
        "MEDALHAS",
        "INOVAÇÃO",
        "OUTROS",
      ];

      const themeOptions = themes.map((theme) =>
        new StringSelectMenuOptionBuilder().setLabel(theme).setValue(theme)
      );

      const selectMenuTheme = new StringSelectMenuBuilder()
        .setCustomId("selecao_tema")
        .setPlaceholder("Selecione o Tema da Sugestão")
        .addOptions(themeOptions);

      const themeRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          selectMenuTheme
        );

      let selectedTheme: string = null;
      let notSelected = true;

      while (notSelected) {
        const selectThemeMessage = await interactionFromModal.editReply({
          content: `Selecione um **Tema** para a sugestão:`,
          components: [themeRow],
        });

        try {
          const interactionThemeSelect =
            await selectThemeMessage.awaitMessageComponent({
              componentType: ComponentType.StringSelect,
              filter: (i) => i.user.id === interactionFromModal.member.user.id,
              time: 30000,
            });

          selectedTheme = interactionThemeSelect.values[0];

          await interactionThemeSelect.update({
            content: `**Tema selecionado:** ${selectedTheme}\n\n**Confirme** ou **cancele** sua seleção.`,
            components: [row],
          });

          const interactionThemeButton =
            await selectThemeMessage.awaitMessageComponent({
              componentType: ComponentType.Button,
              filter: (i) => i.user.id === interactionFromModal.member.user.id,
              time: 30000,
            });
          if (interactionThemeButton.customId === "confirm" && selectedTheme) {
            await interactionThemeButton.update({
              content: "🔄 Processando...",
              components: [],
            });
            suggestionsTheme = selectedTheme;
            notSelected = false;
          }

          if (interactionThemeButton.customId === "cancel") {
            await interactionThemeButton.update({
              content: "🔁 Escolha outro **Tema** abaixo:",
              components: [themeRow, row],
            });

            continue;
          }
        } catch (error) {
          pendingRequests.delete(interaction.user.id);
          return await interactionFromModal.editReply({
            content: "⏰ ***Tempo esgotado. Operação cancelada.***",
            components: [],
          });
        }
      }
    }

    const confirmMessage = await interactionFromModal.editReply({
      content:
        `⚠️ **ATENÇÃO!** Confirme se as informações estão corretas:\n` +
        `\n- **Usuário alterado:** ${targetDB.habboName}` +
        `\n- **Ação:** ${
          interaction.customId === FormIds.adicionarSugestao
            ? "Adicionar"
            : "Remover"
        } Sugestão Aprovada` +
        `${
          interaction.customId === FormIds.adicionarSugestao
            ? `\n- **Tipo da Sugestão:** ${suggestionType}`
            : ""
        }` +
        `${
          interaction.customId === FormIds.adicionarSugestao
            ? `\n- **Tema da Sugestão:** ${suggestionsTheme}`
            : ""
        }` +
        `${
          interaction.customId === FormIds.adicionarSugestao
            ? `\n- **Sugestão:** ${modalResult.link}`
            : `\n- **ID da Sugestão:** ${modalResult.suggestionId}`
        }` +
        `\n\nCaso esteja de acordo, clique em **Confirmar** para prosseguir ou **Cancelar** para abortar.`,
      components: [row],
    });

    try {
      const interactionConfirm = await confirmMessage.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interactionFromModal.member.user.id,
        time: 30000,
      });

      if (interactionConfirm.customId === "confirm") {
        await interactionConfirm.update({
          content: "🔄 Processando...",
          components: [],
        });
      } else {
        pendingRequests.delete(interaction.user.id);
        return await interactionConfirm.update({
          content: "❌ Operação cancelada.",
          components: [],
        });
      }
    } catch (error) {
      pendingRequests.delete(interaction.user.id);
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

      if (existsSuggestion) {
        pendingRequests.delete(interaction.user.id);
        return await interactionFromModal.editReply({
          content: `⚠️  A sugestão que está tentando **criar já existe** para ***${targetDB.habboName}***.`,
        });
      }

      const createSuggestion = await this.container.prisma.suggestions
        .create({
          data: {
            msgLink: modalResult.link,
            type: suggestionType,
            authorId: targetDB._id.$oid,
            theme: suggestionsTheme,
            title: `${
              targetDB.habboName +
              suggestionType +
              String(suggestions[suggestionType])
            }`,
          },
        })
        .catch(async (error) => {
          this.container.logger.error({
            message: `[UpdateApprovedSuggestionsInteractionHandler#run] Ocorreu um erro ao "${interactionFromModal.user.displayName}" tentar criar a sugestão de tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`,
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
        `[UpdateApprovedSuggestionsInteractionHandler#run] Sugestão criada com sucesso no banco de dados por "${interactionFromModal.user.displayName}" do tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`
      );

      suggestionId = createSuggestion.id;
      suggestionTitle = createSuggestion.title;

      const targetMember = await interaction.guild.members.fetch(
        targetDB.discordId
      );

      if (!targetMember) {
        pendingRequests.delete(interaction.user.id);
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
              
              Acesse a aba “***Verificações***” para consultá-la, você poderá encontrá-la com o título "***${suggestionTitle}***".
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
      if (!suggestions) {
        pendingRequests.delete(interaction.user.id);
        return await interactionFromModal.editReply({
          content: `🚫 Membro ***${targetDB.habboName}*** não possui sugestões aprovadas registradas no banco de dados.`,
        });
      }

      const existsSuggestion = await this.container.prisma.suggestions
        .findFirst({
          where: {
            id: modalResult.suggestionId,
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

      suggestionType = existsSuggestion.type as "SM" | "SD";
      suggestionsTheme = existsSuggestion.theme;
      suggestionTitle = existsSuggestion.title;
      modalResult.link = existsSuggestion.msgLink;

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
        `[UpdateApprovedSuggestionsInteractionHandler#run] Sugestão deletada com sucesso do banco de dados por "${interactionFromModal.user.displayName}" do tipo "${suggestionType}" com o link "${modalResult.link}" no membro "${targetDB.habboName}".`
      );
    }

    const notificationChannel = (await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.LOGS
    )) as TextChannel;

    const logMessage = await notificationChannel.send({
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
              name: "📩 Sugestão",
              value: `${modalResult.link}`,
              inline: true,
            },
            {
              name: "🆔 ID da Sugestão",
              value: `${suggestionId}`,
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
              name: `🔖 Tema da Sugestão`,
              value: `${suggestionsTheme}`,
              inline: true,
            },
            {
              name: "🏷️ Título da Sugestão",
              value: `${suggestionTitle}`,
              inline: true,
            },
            {
              name: `🗳️ 🔄 Sugestões ${suggestionType} (Anterior)`,
              value: `${
                suggestionType === "SM" ? suggestions.SM : suggestions.SD
              }`,
              inline: true,
            },
            {
              name: `🗳️ ✅ Sugestões ${suggestionType} (Atualizado)`,
              value: `${
                interaction.customId === FormIds.adicionarSugestao
                  ? suggestionType === "SM"
                    ? suggestions.SM + 1
                    : suggestions.SD + 1
                  : suggestionType === "SM"
                  ? suggestions.SM - 1
                  : suggestions.SD - 1
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
    });

    const logMessageLink = `https://discord.com/channels/${logMessage.guildId}/${logMessage.channelId}/${logMessage.id}`;

    pendingRequests.delete(interaction.user.id);
    return await interactionFromModal.editReply({
      content: `📩 ✅ Sugestão Aprovada ${
        interaction.customId === FormIds.adicionarSugestao
          ? "**adicionada** ao"
          : "**removida** do"
      } perfil de ***${
        targetDB.habboName
      }*** com sucesso.\n\n*Para mais detalhes, confira:* ${logMessageLink}`,
    });
  }
}
