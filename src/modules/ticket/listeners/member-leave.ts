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
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      emitter: container.client.ws,
      event: 'GUILD_MEMBER_REMOVE'
    })
  }

  public override async run(member: GuildMember) {
    this.container.logger.info(
      `Listener guildMemberRemove, a member left the server USER.ID: ${member.user.id}`
    );

    const targetDBamount = await this.container.prisma.transaction.findMany({
      where: {
        user: { discordId: member.user.id }
      },
    })

    let {
			_sum: { amount },
		} = await this.container.prisma.transaction.aggregate({
			where: { user: { discordId: member.user.id } },
			_sum: { amount: true },
		});

    const oldAmount = amount ?? 0

    if (targetDBamount) {
      await this.container.prisma.transaction.deleteMany({
        where: {
          user:  { discordId: member.user.id },
        }
      });
    } else {
      this.container.logger.error(
      `Member don't have any amount in database`
      );
    }

    const targetDBamountNow = await this.container.prisma.transaction.findMany({
      where: {
        user: { discordId: member.user.id }
      },
    })

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

    const cachedGuild = await this.container.client.guilds.fetch(ENVIRONMENT.GUILD_ID);
		const notificationFireChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE,
		);
		const notificationCMBChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.CMB_LOGS,
		);

    if (!notificationFireChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }
    if (!notificationCMBChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    if (targetDB) {
      await notificationFireChannel.send({ embeds: [
        new EmbedBuilder()
        .setTitle(`Demissão de ${targetDB?.habboName}`)
        .setColor(EmbedColors.Error)
        .addFields([
          {
            name: "👤 Demissor",
            value: "Automatizado por Lala 🤖",
          },
          {
            name: "🗒️ Motivo",
            value: "Colaborador saiu do Servidor",
          },
          {
            name: "➕ Extra",
            value: `Seu saldo pendente foi atualizado, é possível ve-lo no canal "logs-saldos"`,
          },
        ])
      ]});

      await notificationCMBChannel.send({ embeds: [
        new EmbedBuilder()
        .setTitle(`Alteração de Saldo de ${targetDB?.habboName}`)
        .setAuthor({ name: "Automatizado por Lala 🤖" })
        .setDescription(
          "Seu saldo foi zerado pelo motivo que o Colaborador deixou o Servidor"
        )
        .setColor(EmbedColors.Error)
        .addFields([
          {
            name: "Saldo Anterior",
            value: `${targetDBamount ? MONETARY_INTL.format(oldAmount ?? 0) : "O usuário não possuia CAM acumulados"}`,
          },
          {
            name: "Saldo Atual",
            value: `${targetDBamountNow ? "Ocorreu um Erro, o usuário ainda possui saldo restante, contate o Desenvolvedor" : MONETARY_INTL.format(0)}`,
          },
        ])
      ]});
    }

    await this.container.prisma.user.delete({
			where: {
				discordId: member.user.id,
			}
		});
  }
}
