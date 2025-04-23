import { Listener, container } from "@sapphire/framework";

import { GuildMember, EmbedBuilder } from "discord.js";
import { EmbedColors } from "$lib/constants/discord";

import { ENVIRONMENT } from "$lib/env";

const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "CAM",
  minimumFractionDigits: 0,
});

export class OnGuildMemberRemoveListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, {
      ...options,
      emitter: container.client,
      event: "guildMemberRemove",
    });
  }

  public override async run(member: GuildMember) {
    if (member.guild.id === ENVIRONMENT.LOG_GUILD_ID) return;
    this.container.logger.info(
      `Listener guildMemberRemove, a member left the server USER.ID: ${member.user.id}`
    );

    const targetDBamount = await this.container.prisma.transaction.findMany({
      where: {
        user: { discordId: member.user.id },
      },
    });

    const {
      _sum: { amount },
    } = await this.container.prisma.transaction.aggregate({
      where: { user: { discordId: member.user.id } },
      _sum: { amount: true },
    });

    const oldAmount = amount ?? 0;

    if (targetDBamount) {
      await this.container.prisma.transaction.deleteMany({
        where: {
          user: { discordId: member.user.id },
        },
      });
    } else {
      this.container.logger.error(`Member don't have any amount in database`);
    }

    const targetDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: member.user.id,
      },
      select: {
        id: true,
        habboName: true,
        discordId: true,
        habboId: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
      },
    });

    const medals = await this.container.prisma.medals.findMany({
      where: {
        users: {
          has: member.user.id,
        },
      },
    });

    if (medals.length > 0) {
      for (const medal of medals) {
        await this.container.prisma.medals.update({
          where: {
            id: medal.id,
          },
          data: {
            users: {
              set: medal.users.filter((id) => id !== member.user.id),
            },
          },
        });
      }
    }

    const cachedGuild = await this.container.client.guilds.fetch(
      ENVIRONMENT.GUILD_ID
    );
    const notificationFireChannel = await cachedGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE
    );
    const notificationCMBChannel = await cachedGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.CMB_LOGS
    );

    if (!notificationFireChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }
    if (!notificationCMBChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    if (targetDB) {
      const botMember = await cachedGuild.members.fetch("1223413995898404968");

      const onlyHabbo = (
        await this.container.utilities.habbo.getProfile(targetDB?.habboName)
      ).unwrapOr(undefined);

      const currentSectorEnvironment = Object.values(
        ENVIRONMENT.SECTORS_ROLES
      ).find((r) => r.id === targetDB.latestPromotionRoleId);

      if (!currentSectorEnvironment) {
        this.container.logger.error(
          `User ${targetDB?.habboName} left the Server, user without currentSector`
        );

        return;
      }

      const currentSector = await cachedGuild.roles.fetch(
        currentSectorEnvironment?.id
      );

      await notificationFireChannel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: botMember.user.tag,
              iconURL: botMember.user.displayAvatarURL(),
            })
            .setTitle(`Demissão de ${targetDB?.habboName}`)
            .setColor(EmbedColors.LalaRed)
            .addFields([
              {
                name: "👤 Demissor",
                value: "Automatizado por Lala 🤖",
              },
              {
                name: "📗 Setor",
                value: currentSector
                  ? `${currentSector}`
                  : "* Não consegui encontrar o setor do usuário",
              },
              {
                name: "🗒️ Motivo",
                value: "Colaborador saiu do Servidor",
              },
            ])
            .setThumbnail(
              onlyHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}&size=b`
                : null
            ),
        ],
      });

      await notificationCMBChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Alteração de Saldo de ${targetDB?.habboName}`)
            .setAuthor({ name: "Automatizado por Lala 🤖" })
            .setDescription(
              "Seu saldo foi zerado pelo motivo que o Colaborador deixou o Servidor"
            )
            .setColor(EmbedColors.LalaRed)
            .addFields([
              {
                name: "Saldo Anterior",
                value: `${
                  targetDBamount
                    ? MONETARY_INTL.format(oldAmount ?? 0)
                    : "O usuário não possuia CAM acumulados"
                }`,
              },
              {
                name: "Saldo Atual",
                value: MONETARY_INTL.format(0),
              },
            ])
            .setThumbnail(
              onlyHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}&size=b`
                : null
            ),
        ],
      });
    }

    await this.container.prisma.user.delete({
      where: {
        discordId: member.user.id,
      },
    });
  }
}
