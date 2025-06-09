import { EmbedBuilder, Message } from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";

import { find, values } from "remeda";

import { ENVIRONMENT } from "$lib/env";
import { EmbedColors } from "$lib/constants/discord";

@ApplyOptions<Command.Options>({ name: "verificar" })
export default class SendCommand extends Command {
  public override async messageRun(message: Message, args: Args) {
    if (!message.inGuild()) {
      throw new Error("Cannot check permissions outside of a guild.");
    }

    const targetResult = await args.pickResult("string");
    if (targetResult.isErr()) return;

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(targetResult.unwrap())
    ).unwrapOr(undefined);

    // if (!onlyHabbo?.name) {
    //   await message.reply({
    //     content:
    //       "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
    //   });

    //   return;
    // }

    const rawName = targetResult
      .unwrap()
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
      limit: 1,
    });

    if (!resultRaw.cursor?.firstBatch.length) {
      await message.reply({
        content:
          "O usuário **não está vinculado** na nossa base de dados, verifique o nome ou **vincule-o**.",
      });

      return;
    }

    const rawTargetDB = resultRaw.cursor.firstBatch[0];

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
    };

    let discordLinked: boolean | undefined;

    // START VERIFY WITHOUT DISCORD
    if (targetDB?.discordLink === false) {
      discordLinked = false;

      if (!targetDB.latestPromotionRoleId) {
        await message.reply({
          content:
            "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentSectorEnvironment = Object.values(
        ENVIRONMENT.SECTORS_ROLES
      ).find((r) => r.id === targetDB.latestPromotionRoleId);

      if (!currentSectorEnvironment) {
        await message.reply({
          content:
            "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentSector = await message.guild.roles.fetch(
        currentSectorEnvironment?.id
      );

      const currentJobEnvironment = Object.values(ENVIRONMENT.JOBS_ROLES).find(
        (r) => r.id === targetDB.latestPromotionJobId
      );

      if (!currentJobEnvironment) {
        await message.reply({
          content:
            "Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentJob = await message.guild.roles.fetch(
        currentJobEnvironment?.id
      );

      let shouldPromote =
        /** isFirstPromotion */
        !targetDB?.latestPromotionRoleId || !targetDB?.latestPromotionDate;

      if (!shouldPromote) {
        const latestPromotionDate =
          targetDB?.latestPromotionDate &&
          new Date(targetDB?.latestPromotionDate);

        const minDaysProm = currentJobEnvironment.minDaysProm;

        if (latestPromotionDate && minDaysProm) {
          const daysSinceLastPromotion = Math.floor(
            (new Date().getTime() - latestPromotionDate.getTime()) /
              (1000 * 3600 * 24)
          );

          let daysForPromote = minDaysProm - daysSinceLastPromotion;
          shouldPromote = daysSinceLastPromotion >= minDaysProm;

          if (daysForPromote < 0) {
            daysForPromote = 0;
          }

          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle(`Verificação de ${targetDB.habboName}`)
                .setFields([
                  {
                    name: "Setor // Cargo",
                    value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                  },
                  {
                    name: "Ultima Promoção",
                    value: targetDB?.latestPromotionDate
                      ? new Date(
                          targetDB?.latestPromotionDate
                        ).toLocaleDateString("pt-BR")
                      : "N/D",
                  },
                  {
                    name: "Promoção Disponível?",
                    value: shouldPromote ? "Sim" : "Não",
                  },
                  {
                    name: "Dias até a próxima Promoção",
                    value: `${daysForPromote}`,
                  },
                  {
                    name: "Discord Vinculado?",
                    value: discordLinked ? "✅ Vinculado " : "❌ Não Vinculado",
                  },
                  {
                    name: "Presenças Totais",
                    value: targetDB.reportsHistory
                      ? targetDB.reportsHistory.length.toString()
                      : "0",
                  },
                  {
                    name: "Presenças C.G",
                    value: targetDB.reportsHistoryCG
                      ? targetDB.reportsHistoryCG.length.toString()
                      : "0",
                  },
                ])
                .setFooter({
                  text: message.author.tag,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  onlyHabbo
                    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
                    : null
                ),
            ],
          });
        } else {
          if (currentJob?.name !== "Vinculado") {
            await message.reply({
              content: `Erro: Função 'minDaysProm': ${minDaysProm} e 'latestPromotionDate': ${latestPromotionDate}, contate o Desenvolvedor.`,
            });
          }

          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle(`Verificação de ${targetDB.habboName}`)
                .setFields([
                  {
                    name: "Setor // Cargo",
                    value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                  },
                  {
                    name: "Ultima Promoção",
                    value: targetDB?.latestPromotionDate
                      ? new Date(
                          targetDB?.latestPromotionDate
                        ).toLocaleDateString("pt-BR")
                      : "N/D",
                  },
                  {
                    name: "Discord Vinculado?",
                    value: discordLinked ? "✅ Vinculado " : "❌ Não Vinculado",
                  },
                ])
                .setFooter({
                  text: message.author.tag,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  onlyHabbo
                    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
                    : null
                ),
            ],
          });
        }
      }

      // END VERIFY WITHOUT DISCORD
      return;
    } else {
      discordLinked = true;
    }

    const { habbo } =
      await this.container.utilities.habbo.inferTargetGuildMember(
        targetResult.unwrap()
      );

    const member = await message.guild.members.fetch(targetDB.discordId);

    if (!member) {
      await message.reply({
        content:
          "Não consegui encontrar o perfil do Discord do usuário que estava com o mesmo ativo, talvez saiu do Servidor?",
      });

      return;
    }

    const currentSectorId =
      this.container.utilities.discord.inferHighestSectorRole(
        member.roles.cache.map((r) => r.id)
      );

    this.container.logger.info(
      `[VerifyCommand#run] currentSectorId: ${currentSectorId}`
    );

    if (!currentSectorId) {
      await message.reply({
        content:
          "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
      });

      return;
    }

    const currentSector = await message.guild.roles.fetch(currentSectorId);

    const currentJobId = this.container.utilities.discord.inferHighestJobRole(
      member.roles.cache.map((r) => r.id)
    );

    if (!currentJobId) {
      await message.reply({
        content:
          "Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
      });

      return;
    }

    const currentJob = currentJobId
      ? await message.guild.roles.fetch(currentJobId)
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

    let shouldPromote =
      /** isFirstPromotion */
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
        const targetMedal = await message.guild.roles.fetch(medal.discordId);

        if (targetMedal) {
          userMedals.push(targetMedal?.name);
        }
      }
    }

    const userMedalsList = userMedals.map((medalName) => medalName).join("\n");

    const [isPromotionPossible, registrationType, denyMotive] =
      await this.container.utilities.discord.isPromotionPossible(
        message,
        member,
        targetDB.latestPromotionJobId
      );

    console.log(isPromotionPossible);
    if (!shouldPromote) {
      const latestPromotionDate =
        databaseUser?.latestPromotionDate &&
        new Date(databaseUser?.latestPromotionDate);

      const minDaysProm = find(
        values(ENVIRONMENT.JOBS_ROLES),
        (x) => x.id === currentJobId
      )?.minDaysProm;

      if (latestPromotionDate && minDaysProm) {
        const daysSinceLastPromotion = Math.floor(
          (new Date().getTime() - latestPromotionDate.getTime()) /
            (1000 * 3600 * 24)
        );

        let daysForPromote = minDaysProm - daysSinceLastPromotion;
        shouldPromote = daysSinceLastPromotion >= minDaysProm;

        if (daysForPromote < 0) {
          daysForPromote = 0;
        }

        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Verificação de ***${databaseUser.habboName}*** 📇`)
              .setFields([
                {
                  name: "💼 Setor // Cargo",
                  value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                },
                {
                  name: "📊 Última Promoção",
                  value: databaseUser?.latestPromotionDate
                    ? new Date(
                        databaseUser?.latestPromotionDate
                      ).toLocaleDateString("pt-BR")
                    : "N/D",
                },
                {
                  name: "📈 Promoção Disponível?",
                  value:
                    shouldPromote && isPromotionPossible
                      ? "Sim ✅"
                      : denyMotive === "COURSE_ED"
                      ? "Indisponível até a conclusão da ED (Especialização da Diretoria). 📙"
                      : denyMotive === "COURSE_EP"
                      ? "Indisponível até a conclusão da EP (Especialização da Presidência). 📕"
                      : "Não ❌",
                },
                {
                  name: "🗓️ Dias até a próxima Promoção",
                  value: `${daysForPromote}`,
                },
                {
                  name: "🪪 Discord Vinculado?",
                  value: discordLinked
                    ? "Vinculado 🔗 ✅"
                    : "Não Vinculado ⛓️‍💥 ❌",
                },
                {
                  name: "🏅 Medalhas",
                  value:
                    userMedalsList.length > 0
                      ? userMedalsList
                      : "O colaborador não possui medalhas acumuladas",
                },
                {
                  name: "🗳️ Presenças Totais",
                  value: databaseUser.reportsHistory
                    ? databaseUser.reportsHistory.length.toString()
                    : "0",
                },
                {
                  name: "🗳️ Presenças C.G",
                  value: databaseUser.reportsHistoryCG
                    ? databaseUser.reportsHistoryCG.length.toString()
                    : "0",
                },
              ])
              .setFooter({
                text: message.author.tag,
                iconURL: message.author.displayAvatarURL(),
              })
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                habbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo?.figureString}`
                  : null
              ),
          ],
        });
      } else {
        if (currentJob?.name !== "Vinculado") {
          await message.reply({
            content: `Erro: Função 'minDaysProm': ${minDaysProm} e 'latestPromotionDate': ${latestPromotionDate}, contate o Desenvolvedor.`,
          });
        }

        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Verificação de ${databaseUser?.habboName}`)
              .setFields([
                {
                  name: "Setor // Cargo",
                  value: `**${currentSector?.name}** // **${currentJob?.name}**`,
                },
                {
                  name: "Ultima Promoção",
                  value: databaseUser?.latestPromotionDate
                    ? new Date(
                        databaseUser?.latestPromotionDate
                      ).toLocaleDateString("pt-BR")
                    : "N/D",
                },
                {
                  name: "Discord Vinculado?",
                  value: discordLinked ? "✅ Vinculado " : "❌ Não Vinculado",
                },
              ])
              .setFooter({
                text: message.author.tag,
                iconURL: message.author.displayAvatarURL(),
              })
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                habbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo?.figureString}`
                  : null
              ),
          ],
        });
      }
    }
  }
}
