import { EmbedColors } from "$lib/constants/discord";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";

@ApplyOptions<Command.Options>({
  name: "toprank",
})
export class TopRankCommand extends Command {
  public override async messageRun(message: Message) {
    const topUsersAll = await this.container.prisma.user.findMany({
      orderBy: {
        reportsHistory: "desc",
      },
      take: 10,
    });

    const topUsersCG = await this.container.prisma.user.findMany({
      orderBy: {
        reportsHistoryCG: "desc",
      },
      take: 10,
    });

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
              .join("\n")}\nPresenças no CG: ${topUsersCG
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
