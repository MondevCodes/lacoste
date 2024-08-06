import { EmbedColors } from "$lib/constants/discord";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import { EmbedBuilder, Message } from "discord.js";  

import { groupBy } from "remeda";
import { MONETARY_INTL } from "./balance";

@ApplyOptions<Command.Options>({
  name: "saldos-todos",
  aliases: ["all-balances"],
  generateDashLessAliases: true,
  generateUnderscoreLessAliases: true,
})
export class AllBalancesCommand extends Command {
  public override async messageRun(message: Message) {
    const allTransactions = await this.container.prisma.transaction.findMany({
      include: {
        user: true,
      },
    });

    const balances = Object.values(groupBy(allTransactions, (t) => t.userId))
      .map((transactions) => {
        const amount = transactions.map((t) => t.amount).reduce((a, b) => a + b, 0);
        return [transactions[0].user.discordId, amount] as const;
      })
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .filter((b) => Number(b[1]) !== 0);

    // Check if the total balances exceed the character limit
    const totalBalanceLength = balances.reduce(
      (acc, [userId]) => acc + `<@${userId}>`.length,
      0
    );

    if (totalBalanceLength > 1024) {
      const embedChunks = [];
      let currentChunk = new EmbedBuilder().setColor(EmbedColors.Default).setTitle("Todos Saldos");

      for (const [userId, amount] of balances) {
        const userMention = `<@${userId}>`;
        const formattedAmount = MONETARY_INTL.format(Number(amount) || 0);
        const fieldValue = `${userMention} -> ${formattedAmount}`;

        // Check if adding the field would exceed the limit
        if (currentChunk.data.fields === undefined || currentChunk.data.fields.length === 0 || currentChunk.data.fields[currentChunk.data.fields.length - 1].value.length + fieldValue.length + 2 < 1024) {
          currentChunk.setFields([{ name: "Usuário", value: fieldValue, inline: false }]);
        } else {
          embedChunks.push(currentChunk);
          currentChunk = new EmbedBuilder().setColor(EmbedColors.Default).setTitle("Todos Saldos (continuação)");
          currentChunk.setFields([{ name: "Usuário", value: fieldValue, inline: false }]);
        }
      }

      embedChunks.push(currentChunk);

      await message.channel.send({ embeds: embedChunks });
    } else {
      // Send a single embed if character limit is not exceeded
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Todos Saldos")
            .setFields({
              name: "Usuário",
              value: `- ${balances
                .map(
                  ([userId, amount]) =>
                    `<@${userId}> -> ${MONETARY_INTL.format(Number(amount) || 0)}`,
                )
                .join("\n- ")}`,
            }),
        ],
      });
    }
  }
}
