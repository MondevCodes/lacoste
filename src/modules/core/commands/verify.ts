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

    if (!onlyHabbo?.name) {
      await message.reply({
        content:
          "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
      });

      return;
    }

    const targetDB = await this.container.prisma.user.findUnique({
      where: { habboId: onlyHabbo.uniqueId },
      select: {
        id: true,
        discordId: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
        latestPromotionJobId: true,
        discordLink: true,
      },
    });

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
                .setTitle(`Verificação de ${onlyHabbo.name}`)
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
                    value: discordLinked ? "Vinculado ✅" : "Não Vinculado ❌",
                  },
                ])
                .setFooter({
                  text: message.author.tag,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}&size=b`
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
                .setTitle(`Verificação de ${onlyHabbo.name}`)
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
                    value: discordLinked ? "Vinculado ✅" : "Não Vinculado ❌",
                  },
                ])
                .setFooter({
                  text: message.author.tag,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setColor(EmbedColors.LalaRed)
                .setThumbnail(
                  `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}&size=b`
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

    const { habbo, member } =
      await this.container.utilities.habbo.inferTargetGuildMember(
        targetResult.unwrap()
      );

    if (!member) {
      await message.reply({
        content:
          "Não consegui encontrar o perfil do Discord do usuário que estava com o mesmo ativo, talvez saiu do Servidor?",
      });

      return;
    } else if (!habbo?.name) {
      await message.reply({
        content:
          "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
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
      where: { habboId: habbo.uniqueId },
      select: {
        id: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
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
              .setTitle(`Verificação de ${habbo.name}`)
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
                  name: "Promoção Disponível?",
                  value: shouldPromote ? "Sim" : "Não",
                },
                {
                  name: "Dias até a próxima Promoção",
                  value: `${daysForPromote}`,
                },
                {
                  name: "Discord Vinculado?",
                  value: discordLinked ? "Vinculado ✅" : "Não Vinculado ❌",
                },
                {
                  name: "Medalhas",
                  value:
                    userMedalsList.length > 0
                      ? userMedalsList
                      : "O colaborador não possui medalhas acumuladas",
                },
              ])
              .setFooter({
                text: message.author.tag,
                iconURL: message.author.displayAvatarURL(),
              })
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo.figureString}&size=b`
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
              .setTitle(`Verificação de ${habbo.name}`)
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
                  value: discordLinked ? "Vinculado ✅" : "Não Vinculado ❌",
                },
              ])
              .setFooter({
                text: message.author.tag,
                iconURL: message.author.displayAvatarURL(),
              })
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo.figureString}&size=b`
              ),
          ],
        });
      }
    }
  }
}
