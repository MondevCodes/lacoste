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
        const amount = transactions
          .map((t) => t.amount)
          .reduce((a, b) => a + b, 0);

        return [transactions[0].user.discordId, amount] as const;
      })
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .filter((b) => Number(b[1]) !== 0);

    const fields = [];
    let fieldValue = '';
    let fieldCount = 0;

    for (const [userId, amount] of balances) {
      const formattedAmount = MONETARY_INTL.format(Number(amount) || 0);
      const userMention = `<@${userId}>`;
      const fieldText = `${userMention} -> ${formattedAmount}\n`;

      if (fieldValue.length + fieldText.length > 1024) {
        fields.push({
          name: `Usuário ${fieldCount + 1}`,
          value: fieldValue,
        });
        fieldValue = '';
        fieldCount++;
      }

      fieldValue += fieldText;
    }

    if (fieldValue.length > 0) {
      fields.push({
        name: `Usuário ${fieldCount + 1}`,
        value: fieldValue,
      });
    }

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(EmbedColors.Default)
          .setTitle("Todos Saldos")
          .setFields(fields),
      ],
    });
  }
}
