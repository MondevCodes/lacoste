import { Listener, Result, container } from "@sapphire/framework";

import { GuildMember, EmbedBuilder } from "discord.js";
import { EmbedColors } from "$lib/constants/discord";

import { ENVIRONMENT } from "$lib/env";

const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "CAM",
	minimumFractionDigits: 0,
});

export class OnGuildMemberRemoveListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      emitter: container.client.ws,
      event: 'GUILD_MEMBER_REMOVE'
    })
  }

  public override async run(member: GuildMember) {
    this.container.logger.info(
      `Listener guildMemberRemove, a member left the server TAG: ${member.user.tag}, ID: ${member.id}, USER.ID: ${member.user.id}, MEMBER: ${member}, GUILD: ${member.guild}`
    );

    const targetDBamount = await this.container.prisma.transaction.findMany({
      where: {
        user: { discordId: member.user.id }
      },
    })

    if (targetDBamount) {
      await this.container.prisma.transaction.updateMany({
        where: {
          user:  { discordId: member.user.id },
        },
        data: {
          amount: 0,
        },
      });
    } else {
      this.container.logger.error(
      `Member don't have any amount in database`
      );
    }

    const targetDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: member.user.id,
      },
      select: {
        id: true,
        discordId: true,
        habboId: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
      },
    });

		const targetJob = this.container.utilities.discord.inferHighestJobRole(
			member.roles.cache.map((r) => r.id),
		);

    await this.container.prisma.user.update({
			where: {
				discordId: member.user.id,
			},
			data: {
				latestPromotionDate: new Date(),
				latestPromotionRoleId: null,
				pendingPromotionRoleId: null,
			},
		});

    let habboName: string | undefined | unknown;
    if (targetDB) {
      habboName =
      (await Result.fromAsync(
        this.container.utilities.habbo.inferTargetGuildMember(
          targetDB?.habboId
        ),
      ));
    }

    const {
			_sum: { amount },
		} = await this.container.prisma.transaction.aggregate({
			where: { user: { discordId: member.user.id } },
			_sum: { amount: true },
		});

    const cachedGuild = await this.container.client.guilds.fetch(ENVIRONMENT.GUILD_ID);
		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE,
		);

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    await notificationChannel.send({ embeds: [
      new EmbedBuilder()
      .setTitle(`Demissão de ${habboName}`)
      .setColor(EmbedColors.Error)
      .setFooter({
        text: `@${member.user.tag} | ${habboName ?? "N/D"}`,
        iconURL: member.displayAvatarURL(),
      })
      .addFields([
        {
          name: "👤 Demissor",
          value: "Automatizado por Lala",
        },
        {
          name: "📗 Cargo",
          value: targetJob ?? "N/D",
        },
        {
          name: "🗒️ Motivo",
          value: "Colaborador saiu do Servidor",
        },
        {
          name: "➕ Extra",
          value: `Seus CAM pendentes foram diminuídos para: ${targetDBamount ? MONETARY_INTL.format(amount ?? 0) : "O usuário não possui CAM acumulados"}`,
        },
      ])
    ]});
  }
}
