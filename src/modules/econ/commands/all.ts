import { EmbedColors } from "$lib/constants/discord";
import { DMChannel, NewsChannel, TextChannel, ThreadChannel } from "discord.js";
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
  // COMANDO DESABILITADO
  public override async messageRun(message: Message) {
    return await message.reply({
      content:
        "⚠️🛠️ O comando *'saldos-todos'* foi **desabilitado temporariamente**.",
    });

    const allTransactions = await this.container.prisma.transaction.findMany({
      include: {
        user: true,
      },
    });

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
    // Caso não tenha permissão ou não tenha cargo de "Filiado Plus"
    if (!hasPermission && !member.roles.cache.has(ROLE_FILIADO_PLUS_ID)) {
      await message.reply({
        content:
          "Não autorizado. Você precisa ter o cargo de <@&788612423363330085> ou <@&1362577893527523571> para verificar saldos de todos usuários.",
      });

      return;
    }

    const balances = Object.values(groupBy(allTransactions, (t) => t.userId))
      .map((transactions) => {
        const amount = transactions
          .map((t) => t.amount)
          .reduce((a, b) => a + b, 0);

        return [transactions[0].user.habboId, amount] as const;
      })
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .filter((b) => Number(b[1]) !== 0);

    const fields = [];
    let fieldValue = "";
    let fieldCount = 0;

    for (const [userHabboId, amount] of balances) {
      const formattedAmount = MONETARY_INTL.format(Number(amount) || 0);

      const targetDB = await this.container.prisma.user.findUnique({
        where: { habboId: userHabboId },
        select: { habboName: true },
      });

      const userMention = targetDB?.habboName;
      const fieldText = `${userMention} -> ${formattedAmount}\n`;

      if (fieldValue.length + fieldText.length > 1024) {
        fields.push({
          name: `Página ${fieldCount + 1}`,
          value: fieldValue,
        });
        fieldValue = "";
        fieldCount++;
      }

      fieldValue += fieldText;
    }

    if (fieldValue.length > 0) {
      fields.push({
        name: `Página ${fieldCount + 1}`,
        value: fieldValue,
      });
    }

    const channel = message.channel;

    if (
      !(channel instanceof TextChannel) &&
      !(channel instanceof DMChannel) &&
      !(channel instanceof NewsChannel) &&
      !(channel instanceof ThreadChannel)
    ) {
      throw new Error("Can’t send message to a non-text channel");
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(EmbedColors.Default)
          .setTitle("Todos Saldos")
          .setFields(fields),
      ],
    });
  }
}
