import { EmbedColors } from "$lib/constants/discord";
import { DMChannel, NewsChannel, TextChannel, ThreadChannel } from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  EmbedBuilder,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { MONETARY_INTL } from "./balance";

interface UserBalance {
  habboId: string;
  habboName: string;
  balance: number;
}

@ApplyOptions<Command.Options>({
  name: "saldos-todos",
  aliases: ["all-balances"],
  generateDashLessAliases: true,
  generateUnderscoreLessAliases: true,
})
export class AllBalancesCommand extends Command {
  private readonly itemsPerPage = 10;
  private readonly interactionTimeout = 300000;

  public override async messageRun(message: Message) {
    if (!message.inGuild()) {
      await message.reply({
        content:
          "É necessário estar no servidor para verificar saldos de outros usuários.",
      });
      return;
    }

    const member = await message.guild.members.fetch(message.author.id);
    const hasPermission = this.container.utilities.discord.hasPermissionByRole({
      category: "SECTOR",
      checkFor: "FUNDAÇÃO",
      roles: member.roles,
    });

    const ROLE_FILIADO_PLUS_ID = "1362577893527523571";
    if (!hasPermission && !member.roles.cache.has(ROLE_FILIADO_PLUS_ID)) {
      await message.reply({
        content:
          "Não autorizado. Você precisa ter o cargo de <@&788612423363330085> ou <@&1362577893527523571> para verificar saldos de todos usuários.",
      });
      return;
    }

    const channel = message.channel;
    if (
      !(channel instanceof TextChannel) &&
      !(channel instanceof DMChannel) &&
      !(channel instanceof NewsChannel) &&
      !(channel instanceof ThreadChannel)
    )
      throw new Error("Can't send message to a non-text channel");

    this.container.logger.info(
      `[AllBalancesCommand#messageRun] Calculando saldos solicitado por ${message.author.username} (${message.author.id})`
    );

    const loadingMessage = await message.reply({
      content: "🔄 Calculando saldos... Isso pode levar alguns segundos.",
    });

    try {
      const balances = await this.getOptimizedBalances();

      if (!balances.length) {
        await loadingMessage.edit({
          content: "❌ Nenhum saldo encontrado.",
        });
        return;
      }

      const nonZeroBalances = balances.filter((b) => b.balance !== 0);

      if (!nonZeroBalances.length) {
        await loadingMessage.edit({
          content: "ℹ️ Todos os usuários possuem saldo zero.",
        });
        return;
      }

      const totalPages = Math.ceil(nonZeroBalances.length / this.itemsPerPage);
      let currentPage = 0;

      const generateEmbed = (page: number) => {
        const start = page * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageBalances = nonZeroBalances.slice(start, end);

        const description = pageBalances
          .map((balance, index) => {
            const rank = start + index + 1;
            const formattedAmount = MONETARY_INTL.format(balance.balance);
            return `**${rank}.** ${balance.habboName} → ${formattedAmount}`;
          })
          .join("\n");

        return new EmbedBuilder()
          .setColor(EmbedColors.Default)
          .setTitle("💰 Todos os Saldos")
          .setDescription(description)
          .setFooter({
            text: `Página ${page + 1} de ${totalPages} • Total: ${
              nonZeroBalances.length
            } usuários`,
          })
          .setTimestamp();
      };

      const generateButtons = (page: number) => {
        const row = new ActionRowBuilder<ButtonBuilder>();

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("first")
            .setLabel("⏮️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0)
        );

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("previous")
            .setLabel("◀️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0)
        );

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("next")
            .setLabel("▶️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1)
        );

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("last")
            .setLabel("⏭️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1)
        );

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("close")
            .setLabel("❌")
            .setStyle(ButtonStyle.Danger)
        );

        return row;
      };

      const paginationMessage = await loadingMessage.edit({
        content: null,
        embeds: [generateEmbed(currentPage)],
        components: totalPages > 1 ? [generateButtons(currentPage)] : [],
      });

      if (totalPages <= 1) return;

      const collector = paginationMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: this.interactionTimeout,
        filter: (interaction) => interaction.user.id === message.author.id,
      });

      collector.on("collect", async (interaction) => {
        try {
          switch (interaction.customId) {
            case "first":
              currentPage = 0;
              break;
            case "previous":
              currentPage = Math.max(0, currentPage - 1);
              break;
            case "next":
              currentPage = Math.min(totalPages - 1, currentPage + 1);
              break;
            case "last":
              currentPage = totalPages - 1;
              break;
            case "close":
              collector.stop("user_closed");
              return;
          }

          await interaction.update({
            embeds: [generateEmbed(currentPage)],
            components: [generateButtons(currentPage)],
          });
        } catch (error) {
          this.container.logger.error(
            "[AllBalancesCommand#messageRun] Erro ao processar interação:",
            error
          );
          if (!interaction.replied && !interaction.deferred)
            await interaction.reply({
              content: "❌ Erro ao processar a ação. Tente novamente.",
              ephemeral: true,
            });
        }
      });

      collector.on("end", async (_, reason) => {
        try {
          const embed = generateEmbed(currentPage);

          if (reason === "user_closed") {
            embed.setDescription("❌ **Comando finalizado pelo usuário.**");
            await paginationMessage.edit({
              embeds: [embed],
              components: [],
            });
          } else {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>();
            generateButtons(currentPage).components.forEach((button) => {
              disabledRow.addComponents(
                ButtonBuilder.from(button).setDisabled(true)
              );
            });

            embed.setFooter({
              text: `${embed.data.footer?.text} • ⏱️ Sessão expirada`,
            });

            await paginationMessage.edit({
              embeds: [embed],
              components: [disabledRow],
            });
          }
        } catch (error) {
          this.container.logger.error(
            "[AllBalancesCommand#messageRun] Erro ao finalizar paginação:",
            error
          );
        }
      });
    } catch (error) {
      this.container.logger.error(
        "[AllBalancesCommand#messageRun] Erro ao buscar saldos:",
        error
      );
      await loadingMessage.edit({
        content: "❌ Erro interno. Tente novamente mais tarde.",
      });
    }
  }

  private async getOptimizedBalances(): Promise<UserBalance[]> {
    try {
      const aggregationResult = await this.container.prisma.transaction.groupBy(
        {
          by: ["userId"],
          _sum: {
            amount: true,
          },
          having: {
            amount: {
              _sum: {
                not: 0,
              },
            },
          },
          orderBy: {
            _sum: {
              amount: "desc",
            },
          },
        }
      );

      const userIds = aggregationResult.map((result) => result.userId);
      const users = await this.container.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          habboId: true,
          habboName: true,
        },
      });

      const userMap = new Map(users.map((user) => [user.id, user]));

      return aggregationResult
        .map((result) => {
          const user = userMap.get(result.userId);
          if (!user) return null;

          return {
            habboId: user.habboId,
            habboName: user.habboName,
            balance: Number(result._sum.amount || 0),
          };
        })
        .filter((balance): balance is UserBalance => balance !== null)
        .sort((a, b) => b.balance - a.balance);
    } catch (error) {
      this.container.logger.error(
        "[AllBalancesCommand#getOptimizedBalances] Erro na agregação otimizada, usando fallback:",
        error
      );

      return await this.getFallbackBalances();
    }
  }

  private async getFallbackBalances(): Promise<UserBalance[]> {
    const batchSize = 1000;
    const userBalances = new Map<
      string,
      { habboId: string; habboName: string; balance: number }
    >();

    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const transactions = await this.container.prisma.transaction.findMany({
        skip,
        take: batchSize,
        include: {
          user: {
            select: {
              id: true,
              habboId: true,
              habboName: true,
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      });

      if (transactions.length < batchSize) hasMore = false;

      for (const transaction of transactions) {
        const userId = transaction.user.id;

        if (!userBalances.has(userId))
          userBalances.set(userId, {
            habboId: transaction.user.habboId,
            habboName: transaction.user.habboName,
            balance: 0,
          });

        const userBalance = userBalances.get(userId)!;
        userBalance.balance += Number(transaction.amount);
      }

      skip += batchSize;
    }

    return Array.from(userBalances.values())
      .filter((balance) => balance.balance !== 0)
      .sort((a, b) => b.balance - a.balance);
  }
}
