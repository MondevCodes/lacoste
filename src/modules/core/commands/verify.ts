import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { find, values } from "remeda";

import { ENVIRONMENT } from "$lib/env";
import { EmbedColors } from "$lib/constants/discord";
import moment from "moment";

@ApplyOptions<Command.Options>({
  name: "verificar",
  description: "Verificar Perfil de Carreira & Sugestões de um Usuário",
})
export default class SendCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    const isProduction =
      this.container.utilities.discord.verifyInjectSlashCommands(
        ENVIRONMENT.NODE_ENV
      );

    if (!isProduction) return;

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((option) =>
          option
            .setName("nick_habbo")
            .setDescription("Nickname do usuário no Habbo")
            .setRequired(true)
        )
        .addStringOption((options) =>
          options
            .setName("perfil")
            .setDescription("Carreira / Sugestões")
            .setRequired(true)
            .addChoices(
              { name: "Carreira", value: "carreira" },
              { name: "Sugestão", value: "sugestao" }
            )
        )
        .addStringOption((options) =>
          options
            .setName("tipo_sugestão")
            .setDescription(
              "Para filtrar as sugestões selecione um tipo de Sugestão"
            )
            .setRequired(false)
            .addChoices(
              { name: "SM", value: "SM" },
              { name: "SD", value: "SD" }
            )
        )
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const interactionId = interaction.user.id;

    if (!interaction.inGuild() || !interaction.user) {
      this.container.logger.warn(
        `[VerifyCommand#chatInputRun] ${interactionId} tried to perform an action in a DM.`
      );
      return await interaction.reply({
        content:
          "⚠️  Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetResult = interaction.options.getString("nick_habbo", true);
    const selectProfile =
      interaction.options.getString("perfil", false) ?? "carreira";

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(targetResult)
    ).unwrapOr(undefined);

    const rawName = targetResult.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const resultRaw: any = await this.container.prisma.$runCommandRaw({
      find: "User",
      filter: {
        habboName: {
          $regex: `^${rawName}$`,
          $options: "i",
        },
      },
      limit: 1,
    });

    if (!resultRaw.cursor?.firstBatch.length) {
      return await interaction.reply({
        content:
          "⚠️  O usuário **não está vinculado** na nossa base de dados, verifique o nome ou **vincule-o**.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const rawTargetDB = resultRaw.cursor.firstBatch[0];

    const countSuggestions = await this.container.prisma.suggestions.groupBy({
      by: ["type"],
      _count: { _all: true },
      where: {
        authorId: rawTargetDB._id.$oid,
        type: { in: ["SM", "SD"] },
      },
    });
    const suggestions = {
      SM: countSuggestions.find((c) => c.type === "SM")?._count._all ?? 0,
      SD: countSuggestions.find((c) => c.type === "SD")?._count._all ?? 0,
    };

    const targetDB = {
      ...rawTargetDB,
      _id: rawTargetDB._id?.$oid || rawTargetDB._id,
      id: rawTargetDB._id?.$oid || rawTargetDB._id,
      createdAt: rawTargetDB.createdAt?.$date
        ? new Date(rawTargetDB.createdAt.$date)
        : null,
      updatedAt: rawTargetDB.updatedAt?.$date
        ? new Date(rawTargetDB.updatedAt.$date)
        : null,
      latestPromotionDate: rawTargetDB.latestPromotionDate?.$date
        ? new Date(rawTargetDB.latestPromotionDate.$date)
        : null,
      reportsHistory:
        (rawTargetDB.reportsHistory ?? []).map(
          (date: { $date: string }) => new Date(date.$date)
        ) ?? [],
      reportsHistoryCG:
        (rawTargetDB.reportsHistoryCG ?? []).map(
          (date: { $date: string }) => new Date(date.$date)
        ) ?? [],
    };

    let discordLinked: boolean | undefined;

    // START VERIFY WITHOUT DISCORD
    if (targetDB?.discordLink === false && selectProfile === "carreira") {
      discordLinked = false;

      this.container.logger.info(
        `[VerifyCommand#run] ${interaction.user.username} use Verify on user ${targetDB.habboName} without discord`
      );

      if (!targetDB.latestPromotionRoleId) {
        return await interaction.reply({
          content:
            "⚠️  Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentSectorEnvironment = Object.values(
        ENVIRONMENT.SECTORS_ROLES
      ).find((r) => r.id === targetDB.latestPromotionRoleId);

      if (!currentSectorEnvironment) {
        return await interaction.reply({
          content:
            "⚠️  Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentSector = await interaction.guild.roles.fetch(
        currentSectorEnvironment?.id
      );

      const currentJobEnvironment = Object.values(ENVIRONMENT.JOBS_ROLES).find(
        (r) => r.id === targetDB.latestPromotionJobId
      );

      if (!currentJobEnvironment) {
        return await interaction.reply({
          content:
            "⚠️  Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentJob = await interaction.guild.roles.fetch(
        currentJobEnvironment?.id
      );

      let shouldPromote =
        !targetDB?.latestPromotionRoleId || !targetDB?.latestPromotionDate;

      const allPresences: Date[] = [
        ...(targetDB.reportsHistory ?? []),
        ...(targetDB.reportsHistoryCG ?? []),
      ];

      let lastPresence = "Nenhuma presença registrada até o momento";

      if (allPresences.length) {
        const sortedPresences = allPresences
          .map((date) => new Date(date))
          .sort((a, b) => b.getTime() - a.getTime());

        lastPresence = `<t:${Math.floor(
          sortedPresences[0].getTime() / 1000
        )}:f>`;
      }

      if (!shouldPromote) {
        const latestPromotionDate =
          targetDB?.latestPromotionDate &&
          new Date(targetDB?.latestPromotionDate);

        const minDaysProm = currentJobEnvironment.minDaysProm;

        if (latestPromotionDate && minDaysProm) {
          const now = moment();
          const timeSinceLastPromotion = moment.duration(
            now.diff(latestPromotionDate)
          );
          const timeRemainingMs =
            minDaysProm * 24 * 60 * 60 * 1000 -
            timeSinceLastPromotion.asMilliseconds();

          let timeForPromote: string = null;

          if (timeRemainingMs <= 0) {
            timeForPromote = "Tempo mínimo atingido ✅";
            shouldPromote = true;
          } else {
            const timeRemaining = moment.duration(timeRemainingMs);
            const days = Math.floor(timeRemaining.asDays());
            const hours = timeRemaining.hours();
            const minutes = timeRemaining.minutes();

            timeForPromote = `${
              days > 0 ? days + (days > 1 ? " dias " : " dia ") : ""
            }${hours}h${minutes < 10 ? "0" : ""}${minutes}min`;
          }

          await interaction.channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  `Perfil de Carreira de ***${targetDB.habboName}*** 📇`
                )
                .setFields([
                  {
                    name: "💼 Setor // Cargo",
                    value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                  },
                  {
                    name: "📊 Última Promoção",
                    value: targetDB?.latestPromotionDate
                      ? `<t:${moment(targetDB?.latestPromotionDate).unix()}:f>`
                      : "N/D",
                  },
                  {
                    name: "📈 Promoção Disponível",
                    value: shouldPromote ? "Sim ✅" : "Não ❌",
                  },
                  {
                    name: "🗓️ Tempo até a próxima Promoção",
                    value: `${timeForPromote}`,
                  },
                  {
                    name: "🪪 Discord Vinculado",
                    value: discordLinked
                      ? "Vinculado 🔗 ✅"
                      : "Não Vinculado ⛓️‍💥 ❌",
                  },
                  {
                    name: "🗳️ Presenças Totais",
                    value: targetDB.reportsHistory
                      ? targetDB.reportsHistory.length.toString()
                      : "0",
                  },
                  {
                    name: "🗳️ Presenças C.G",
                    value: targetDB.reportsHistoryCG
                      ? targetDB.reportsHistoryCG.length.toString()
                      : "0",
                  },
                  {
                    name: "⌚ Última Presença em Sede",
                    value:
                      lastPresence === `<t:1355314332:f>`
                        ? lastPresence + " *(adicionado manualmente)*"
                        : lastPresence,
                  },
                ])
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  onlyHabbo
                    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
                    : null
                ),
            ],
          });

          return await interaction.reply({
            content: `✅📇 Verificação Concluída`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          if (currentJob?.name !== "Vinculado") {
            return await interaction.reply({
              content: `Erro: Função 'minDaysProm': ${minDaysProm} e 'latestPromotionDate': ${latestPromotionDate}, contate o Desenvolvedor.`,
              flags: MessageFlags.Ephemeral,
            });
          }

          await interaction.channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  `Perfil de Carreira de ***${targetDB.habboName}*** 📇`
                )
                .setFields([
                  {
                    name: "💼 Setor // Cargo",
                    value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                  },
                  {
                    name: "📊 Última Promoção",
                    value: targetDB?.latestPromotionDate
                      ? `<t:${moment(targetDB?.latestPromotionDate).unix()}:f>`
                      : "N/D",
                  },
                  {
                    name: "🪪 Discord Vinculado",
                    value: discordLinked
                      ? "Vinculado 🔗 ✅"
                      : "Não Vinculado ⛓️‍💥 ❌",
                  },
                ])
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  onlyHabbo
                    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
                    : null
                ),
            ],
          });

          return await interaction.reply({
            content: `✅📇 Verificação Concluída`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // END VERIFY WITHOUT DISCORD
    } else {
      discordLinked = true;
    }

    const { habbo } =
      await this.container.utilities.habbo.inferTargetGuildMember(targetResult);

    const member = await interaction.guild.members.fetch(targetDB.discordId);

    if (!member) {
      return await interaction.reply({
        content:
          "⚠️  Não consegui encontrar o perfil do Discord do usuário que estava com o mesmo ativo, talvez saiu do Servidor?",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (selectProfile === "sugestao") {
      const suggestionTypeSelect =
        interaction.options.getString("tipo_sugestão", false) ?? null;

      const allSuggestions = await this.container.prisma.suggestions.findMany({
        where: {
          authorId: targetDB.id,
          ...(suggestionTypeSelect ? { type: suggestionTypeSelect } : {}),
        },
        orderBy: {
          title: "asc",
        },
      });

      if (!allSuggestions.length) {
        return interaction.reply({
          content: `❌ Nenhuma sugestão encontrada para **${targetDB.habboName}**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const options = allSuggestions.map((suggestion) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(
            `${suggestion.type + " - "}${suggestion.title ?? "Sem Título"} - ${
              suggestion.theme ?? "Sem Tema"
            }`
          )
          .setValue(String(suggestion.id))
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("selecao_sugestao")
        .setPlaceholder("Selecione uma Sugestão")
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu
      );

      let titleMenu = `📩  Todas Sugestões de **${targetDB.habboName}**`;
      switch (suggestionTypeSelect) {
        case "SM":
          titleMenu = `📩 🏅 Sugestões com Medalha de **${targetDB.habboName}**`;
          break;
        case "SD":
          titleMenu = `📩 🎨 Sugestões Diversas de **${targetDB.habboName}**`;
          break;
      }

      let titleMenuContinue = `📩  Deseja ver mais Sugestões de **${targetDB.habboName}**?`;
      switch (suggestionTypeSelect) {
        case "SM":
          titleMenuContinue = `📩 🏅 Deseja ver mais Sugestões com Medalha de **${targetDB.habboName}**?`;
          break;
        case "SD":
          titleMenuContinue = `📩 🎨 Deseja ver mais Sugestões Diversas de **${targetDB.habboName}**?`;
          break;
      }

      const endMenuButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("endMenu")
          .setLabel("🛑 Finalizar")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        content: titleMenu,
        components: [row, endMenuButton],
        flags: MessageFlags.Ephemeral,
      });

      const viewedSuggestions = new Set();

      const collector =
        await interaction.channel?.createMessageComponentCollector({
          filter: (i) =>
            i.user.id === interaction.user.id &&
            (i.customId === "selecao_sugestao" || i.customId === "endMenu"),
          time: 120000,
        });

      collector?.on("collect", async (response) => {
        try {
          await response.deferUpdate();

          if (response.customId === "endMenu") {
            return collector.stop("manual_finish");
          }

          const suggestionSelected = allSuggestions.find(
            (suggestion) =>
              suggestion.id ===
              (response.isStringSelectMenu() ? response.values[0] : null)
          );

          if (!suggestionSelected) {
            return await interaction.followUp({
              content: "❌ Sugestão não encontrada!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const [, , , , , , msgId] = suggestionSelected.msgLink.split("/");
          const feedbackChannel = (await interaction.guild.channels.fetch(
            ENVIRONMENT.NOTIFICATION_CHANNELS.FEEDBACKS
          )) as TextChannel;
          const originalMessage = await feedbackChannel.messages.fetch(msgId);

          viewedSuggestions.add(suggestionSelected.id);

          const updatedOptions = allSuggestions.map((suggestion) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(
                `${viewedSuggestions.has(suggestion.id) ? "✔️ VISTO - " : ""}${
                  suggestion.type + " - "
                }${suggestion.title ?? "Sem Título"} - ${
                  suggestion.theme ?? "Sem Tema"
                }`
              )
              .setValue(String(suggestion.id))
          );

          const updatedSelectMenu = new StringSelectMenuBuilder()
            .setCustomId("selecao_sugestao")
            .setPlaceholder("Selecione uma Sugestão")
            .addOptions(updatedOptions);

          const updatedRow =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              updatedSelectMenu
            );

          const suggestionInfos = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${titleMenuContinue}\n\n✅ **Última seleção:** ${suggestionSelected.title}\n🆔 **ID da Sugestão:** ${suggestionSelected.id}`;
          const cutMsgWarn = `**(...)**\n\n📝✂️ **A mensagem é muito grande!** *Caso queira ver completo, confira:* ${suggestionSelected.msgLink}`;
          const lengthLimitDiscord = 2000 - suggestionInfos.length;
          if (originalMessage.content.length > lengthLimitDiscord) {
            originalMessage.content =
              originalMessage.content.slice(
                0,
                lengthLimitDiscord - cutMsgWarn.length
              ) + cutMsgWarn;
          }

          await interaction.editReply({
            embeds: originalMessage.embeds,
            files: [...originalMessage.attachments.values()].map((att) => ({
              attachment: att.url,
              name: att.name,
            })),
            content: `${originalMessage.content}${suggestionInfos}`,
            components: [updatedRow, endMenuButton],
          });
        } catch (error) {
          this.container.logger.error(
            `[VerifyCommand#run/Suggestion] ${interaction.user.displayName} tentou achar a sugestão de ${targetDB.habboName} e falhou: ${error}`
          );
          return await interaction.editReply({
            content: `❌ *Erro ao buscar a mensagem*`,
          });
        }
      });

      collector?.on("end", async (_, reason) => {
        try {
          if (reason === "manual_finish") {
            return await interaction.editReply({
              content: `✅ 📩  **Verificação de Sugestões finalizada manualmente**`,
              components: [],
            });
          }

          if (reason === "user_closed") {
            return await interaction.editReply({
              content: `✅ 📩  **Verificação finalizada pelo usuário**`,
              components: [],
            });
          } else {
            const disabledSelectMenu = new StringSelectMenuBuilder()
              .setCustomId("selecao_sugestao_disabled")
              .setPlaceholder("Tempo esgotado - Menu desabilitado")
              .addOptions([
                new StringSelectMenuOptionBuilder()
                  .setLabel("Sessão finalizada")
                  .setValue("disabled"),
              ])
              .setDisabled(true);

            const disabledRow =
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                disabledSelectMenu
              );

            const disabledButton = new ButtonBuilder()
              .setCustomId("endMenu")
              .setLabel("⏱️ Sessão Expirada")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true);

            const disabledButtonRow =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                disabledButton
              );

            return await interaction.editReply({
              content: `⏱️ **Sessão expirada**\n*Use o comando novamente para continuar verificando.*`,
              components: [disabledRow, disabledButtonRow],
            });
          }
        } catch (error) {
          console.log("Erro ao finalizar collector");
        }
        return "";
      });

      return "";
    }

    const currentSectorId =
      this.container.utilities.discord.inferHighestSectorRole(
        member.roles.cache.map((r) => r.id)
      );

    if (!currentSectorId) {
      return await interaction.reply({
        content:
          "⚠️  Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentSector = await interaction.guild.roles.fetch(currentSectorId);

    const currentJobId = this.container.utilities.discord.inferHighestJobRole(
      member.roles.cache.map((r) => r.id)
    );

    if (!currentJobId) {
      return await interaction.reply({
        content:
          "⚠️  Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentJob = currentJobId
      ? await interaction.guild.roles.fetch(currentJobId)
      : member.roles.highest;

    const databaseUser = await this.container.prisma.user.findUnique({
      where: { discordId: member.user.id },
      select: {
        id: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
        habboName: true,
        reportsHistory: true,
        reportsHistoryCG: true,
      },
    });

    this.container.logger.info(
      `[VerifyCommand#run] ${interaction.user.username} use Verify on user ${databaseUser.habboName}, currentSectorId: ${currentSectorId}`
    );

    let shouldPromote =
      !databaseUser?.latestPromotionRoleId ||
      !databaseUser?.latestPromotionDate;

    const medals = await this.container.prisma.medals.findMany({
      where: {
        users: {
          has: member.user.id,
        },
      },
    });

    let userMedals: string[] = [];
    if (medals.length > 0) {
      for await (const medal of medals) {
        const targetMedal = await interaction.guild.roles.fetch(
          medal.discordId
        );

        if (targetMedal) {
          userMedals.push(targetMedal?.name);
        }
      }
    }

    const userMedalsList = userMedals.map((medalName) => medalName).join("\n");

    const [isPromotionPossible, _, denyMotive] =
      await this.container.utilities.discord.isPromotionPossible(
        interaction,
        member,
        targetDB.latestPromotionJobId
      );
    const allPresences: Date[] = [
      ...(databaseUser.reportsHistory ?? []),
      ...(databaseUser.reportsHistoryCG ?? []),
    ];

    let lastPresence = "*Nenhuma presença registrada até o momento*";

    if (allPresences.length) {
      const sortedPresences = allPresences
        .map((date) => new Date(date))
        .sort((a, b) => b.getTime() - a.getTime());

      lastPresence = `<t:${Math.floor(sortedPresences[0].getTime() / 1000)}:f>`;
    }

    if (!shouldPromote) {
      const latestPromotionDate =
        databaseUser?.latestPromotionDate &&
        new Date(databaseUser?.latestPromotionDate);

      const minDaysProm = find(
        values(ENVIRONMENT.JOBS_ROLES),
        (x) => x.id === currentJobId
      )?.minDaysProm;

      if (latestPromotionDate && minDaysProm) {
        const now = moment();
        const timeSinceLastPromotion = moment.duration(
          now.diff(latestPromotionDate)
        );
        const timeRemainingMs =
          minDaysProm * 24 * 60 * 60 * 1000 -
          timeSinceLastPromotion.asMilliseconds();

        let timeForPromote: string = null;

        if (timeRemainingMs <= 0) {
          timeForPromote = "Tempo mínimo atingido ✅";
          shouldPromote = true;
        } else {
          const timeRemaining = moment.duration(timeRemainingMs);
          const days = Math.floor(timeRemaining.asDays());
          const hours = timeRemaining.hours();
          const minutes = timeRemaining.minutes();

          timeForPromote = `${
            days > 0 ? days + (days > 1 ? " dias " : " dia ") : ""
          }${hours}h${minutes < 10 ? "0" : ""}${minutes}min`;
        }

        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `Perfil de Carreira de ***${databaseUser.habboName}*** 📇`
              )
              .setFields([
                {
                  name: "💼 Setor // Cargo",
                  value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                  inline: false,
                },
                {
                  name: "📊 Última Promoção",
                  value: databaseUser?.latestPromotionDate
                    ? `<t:${moment(
                        databaseUser?.latestPromotionDate
                      ).unix()}:f>`
                    : "N/D",
                  inline: true,
                },
                {
                  name: "🗓️ Tempo até a próxima Promoção",
                  value: `${timeForPromote}`,
                  inline: true,
                },
                {
                  name: "📈 Promoção Disponível",
                  value:
                    shouldPromote && isPromotionPossible
                      ? "Sim ✅"
                      : denyMotive === "COURSE_ED"
                      ? "Indisponível até a conclusão da **ED (Especialização da Diretoria)**. 📙"
                      : denyMotive === "COURSE_EP"
                      ? "Indisponível até a conclusão da **EP (Especialização da Presidência)**. 📕"
                      : "Não ❌",
                  inline: false,
                },
                {
                  name: "🪪 Discord Vinculado",
                  value: discordLinked
                    ? "Vinculado 🔗 ✅"
                    : "Não Vinculado ⛓️‍💥 ❌",
                  inline: false,
                },
                {
                  name: "🏅 Medalhas",
                  value:
                    userMedalsList.length > 0
                      ? userMedalsList
                      : "*O colaborador não possui medalhas acumuladas*",
                  inline: false,
                },
                {
                  name: "📩 Sugestões com Medalhas 🏅",
                  value: suggestions.SM > 0 ? `${suggestions.SM}` : "*Nenhuma*",
                  inline: true,
                },
                {
                  name: "📩 Sugestões Diversas 🎨",
                  value: suggestions.SD > 0 ? `${suggestions.SD}` : "*Nenhuma*",
                  inline: true,
                },
                {
                  name: " ",
                  value: " ",
                  inline: false,
                },
                {
                  name: "🗳️ Presenças Totais",
                  value: databaseUser.reportsHistory
                    ? databaseUser.reportsHistory.length.toString()
                    : "0",
                  inline: true,
                },
                {
                  name: "🗳️ Presenças C.G",
                  value: databaseUser.reportsHistoryCG
                    ? databaseUser.reportsHistoryCG.length.toString()
                    : "0",
                  inline: true,
                },
                {
                  name: "⌚ Última Presença em Sede",
                  value:
                    lastPresence === `<t:1355314332:f>`
                      ? lastPresence + " *(adicionado manualmente)*"
                      : lastPresence,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                habbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo?.figureString}`
                  : null
              ),
          ],
        });

        return await interaction.reply({
          content: `✅📇 Verificação Concluída`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        if (currentJob?.name !== "Vinculado") {
          return await interaction.reply({
            content: `❌ Erro: Função 'minDaysProm': ${minDaysProm} e 'latestPromotionDate': ${latestPromotionDate}, contate o Desenvolvedor.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `Perfil de Carreira de ***${databaseUser.habboName}*** 📇`
              )
              .setFields([
                {
                  name: "💼 Setor // Cargo",
                  value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                },
                {
                  name: "📊 Última Promoção",
                  value: databaseUser?.latestPromotionDate
                    ? `<t:${moment(
                        databaseUser?.latestPromotionDate
                      ).unix()}:f>`
                    : "N/D",
                },
                {
                  name: "🪪 Discord Vinculado",
                  value: discordLinked
                    ? "Vinculado 🔗 ✅"
                    : "Não Vinculado ⛓️‍💥 ❌",
                },
              ])
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                habbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo?.figureString}`
                  : null
              ),
          ],
        });

        return await interaction.reply({
          content: `✅📇 Verificação Concluída`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return await interaction.reply({
      content: `✅ Comando finalizado.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
