import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { type Message } from "discord.js";

@ApplyOptions<Command.Options>({
  name: "developer",
})
export class DevCommand extends Command {
  public override async messageRun(message: Message) {
    if (!message.inGuild()) {
      await message.reply({
        content:
          "É necessário estar no servidor para dar comandos de Desenvolvedor.",
      });

      return;
    }

    if (!message.member) {
      await message.reply({
        content:
          "Ocorreu um erro ao tentar pegar os dados do membro que enviou o comando.",
      });

      return;
    }

    const isAuthorized = message.member.roles.cache.has("1208559275421597776");

    if (!isAuthorized) {
      await this.container.utilities.discord.sendEphemeralMessage(message, {
        method: "reply",
        content: `Não autorizado. Você precisa ter o cargo de <@&1208559275421597776> para dar comandos de Desenvolvedor.`,
      });

      return;
    }

    // COMMAND:

    const users = await this.container.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                latestPromotionRoleId: { not: null },
              },
              { latestPromotionRoleId: { not: "" } },
            ],
          },
          { discordLink: { not: false } },
        ],
      },
    });

    let count = 0;
    for await (const user of users) {
      const discordUser = await message.guild.members.fetch(user.discordId);

      const jobRoles = discordUser.roles.cache.filter((role) =>
        Object.values(ENVIRONMENT.JOBS_ROLES).some((r) => r.id === role.id)
      );

      if (jobRoles.size === 0) continue;

      const currentJob = jobRoles.reduce((highest, current) => {
        const currentIndex =
          Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === current.id)
            ?.index ?? 0;

        const highestIndex =
          Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === highest.id)
            ?.index ?? 0;

        if (!currentIndex || !highestIndex) {
          return current;
        }

        return currentIndex > highestIndex ? current : highest;
      });

      await this.container.prisma.user.update({
        where: {
          discordId: discordUser.user.id,
        },
        data: {
          latestPromotionJobId: currentJob.id,
        },
      });

      count++;
    }

    await message.react("✅");
    await message.react("🤖");
    await message.reply({
      content: `**${count}** usuários foram atualizados.`,
    });
  }
}
