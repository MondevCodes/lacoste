import { ApplyOptions } from "@sapphire/decorators";
import { Command, type Args } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";

export const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "CAM",
  minimumFractionDigits: 0,
});

@ApplyOptions<Command.Options>({
  name: "saldo",
  aliases: ["balance", "saldos"],
})
export class BalanceCommand extends Command {
  public override async messageRun(message: Message, args: Args) {
    const authorDB = await this.container.prisma.user
      .findUniqueOrThrow({
        where: {
          discordId: message.author.id,
        },
        select: {
          id: true,
          discordId: true,
          habboName: true,
          habboId: true,
        },
      })
      .catch(async (error) => {
        this.container.logger.error(
          `[BalanceMessageHandler#run] Error to get database author: ${error}`
        );

        await message.reply({
          content:
            "❌🐛 Ocorreu um erro ao buscar o usuário autor no banco de dados.",
        });
      });

    if (!authorDB) return;

    const user = (await args.pickResult("string")).unwrapOr(undefined);

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(
        user ?? authorDB.habboName
      )
    ).unwrapOr(undefined);

    const targetDB = await this.container.prisma.user.findFirst({
      where: {
        habboName: {
          equals: user ?? authorDB.habboName,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        discordId: true,
        habboName: true,
        habboId: true,
      },
    });

    const {
      _sum: { amount },
    } = await this.container.prisma.transaction.aggregate({
      where: { user: { habboId: targetDB?.habboId ?? authorDB.habboId } },
      _sum: { amount: true },
    });

    if (user) {
      if (!message.inGuild()) {
        await message.reply({
          content:
            "É necessário estar no servidor para verificar saldos de outros usuários.",
        });

        return;
      }

      const member = await message.guild.members.fetch(message.author.id);

      const hasPermission =
        this.container.utilities.discord.hasPermissionByRole({
          category: "SECTOR",
          checkFor: "FUNDAÇÃO",
          roles: member.roles,
        });

      const ROLE_FILIADO_PLUS_ID = "1362577893527523571";
      // Caso não tenha permissão ou não tenha cargo de "Filiado Plus"
      if (!hasPermission && !member.roles.cache.has(ROLE_FILIADO_PLUS_ID)) {
        await message.reply({
          content:
            "Não autorizado. Você precisa ter o cargo de <@&788612423363330085> ou <@&1362577893527523571> para verificar saldos de outros usuários.",
        });

        return;
      }
    }

    await this.container.utilities.discord.sendEphemeralMessage(message, {
      method: "reply",
      embeds: [
        new EmbedBuilder()
          .setTitle("Verificação de Saldo")
          .setDescription(
            (targetDB?.discordId ?? authorDB.discordId) === message.author.id
              ? `Seu saldo é de **${MONETARY_INTL.format(amount ?? 0)}**`
              : `**${targetDB?.habboName}** tem **${MONETARY_INTL.format(
                  amount ?? 0
                )}**`
          )
          .setThumbnail(
            onlyHabbo
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}&size=b`
              : null
          ),
      ],
    });
  }
}
