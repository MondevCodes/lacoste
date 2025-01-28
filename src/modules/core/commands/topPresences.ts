import { EmbedColors } from "$lib/constants/discord";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";

@ApplyOptions<Command.Options>({
  name: "toprank",
})
export class TopRankCommand extends Command {
  public override async messageRun(message: Message) {
    if (!message.inGuild()) {
      await message.reply({
        content:
          "É necessário estar no servidor para ver o ranking de presenças.",
      });

      return;
    }

    const member = await message.guild.members.fetch(message.author.id);

    const hasPermission = this.container.utilities.discord.hasPermissionByRole({
      category: "SECTOR",
      checkFor: "FUNDAÇÃO",
      roles: member.roles,
    });

    if (!hasPermission) {
      await message.reply({
        content:
          "Não autorizado. Você precisa ter o cargo de <@&788612423363330085> para ver o ranking de presenças.",
      });

      return;
    }

    const allUsers = await this.container.prisma.user.findMany({
      where: {
        habboName: { not: "" },
        latestPromotionDate: { not: null },
        AND: [
          { latestPromotionRoleId: { not: null } },
          { latestPromotionRoleId: { isSet: true } },
        ],
      },
    });

    const topUsersAll = allUsers
      .sort((a, b) => b.reportsHistory.length - a.reportsHistory.length)
      .slice(0, 10);

    const topUsersCG = allUsers
      .sort((a, b) => b.reportsHistoryCG.length - a.reportsHistoryCG.length)
      .slice(0, 10);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🥇 Ranking de Presenças 🥈")
          .setDescription(
            `**Top 10**\n\nPresenças no Total:\n${topUsersAll
              .map(
                (user) =>
                  `- **${user.habboName}** // **${user.reportsHistory.length}**`
              )
              .join("\n")}\n\nPresenças no C.G:\n${topUsersCG
              .map(
                (user) =>
                  `- **${user.habboName}** // **${user.reportsHistoryCG.length}**`
              )
              .join("\n")}`
          )
          .setFooter({
            text: message.author.tag,
            iconURL: message.author.displayAvatarURL(),
          })
          .setColor(EmbedColors.LalaRed),
      ],
    });
  }
}
