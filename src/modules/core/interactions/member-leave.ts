import { ApplyOptions } from "@sapphire/decorators";
import { Listener, Result } from "@sapphire/framework";

import { GuildMember, EmbedBuilder } from "discord.js";
import { EmbedColors } from "$lib/constants/discord";

import { ENVIRONMENT } from "$lib/env";

const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "CAM",
	minimumFractionDigits: 0,
});

@ApplyOptions<Listener.Options>({
  event: "guildMemberRemove",
})
export class OnGuildMemberRemoveListener extends Listener {
  public override async run(member: GuildMember) {
    await this.container.prisma.transaction.updateMany({
      where: {
        user:  { discordId: member.id },
      },
      data: {
        amount: 0,
      },
    });

    await this.container.prisma.user.findUnique({
      where: {
        discordId: member.id,
      },
      select: {
        id: true,
        discordId: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
      },
    });

		const targetJob = this.container.utilities.discord.inferHighestJobRole(
			member.roles.cache.map((r) => r.id),
		);

    await this.container.prisma.user.update({
			where: {
				discordId: member.id,
			},
			data: {
				latestPromotionDate: new Date(),
				latestPromotionRoleId: null,
				pendingPromotionRoleId: null,
			},
		});

    let habboName: string | undefined;
    const authorResult =
    (await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${member.user.tag}`,
        true,
      ),
    ));
    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });
      habboName = authorHabbo?.name ?? "N/A";
    }

    const {
			_sum: { amount },
		} = await this.container.prisma.transaction.aggregate({
			where: { user: { discordId: member.id } },
			_sum: { amount: true },
		});

    const cachedGuild = member.guild ?? (await this.container.client.guilds.fetch(ENVIRONMENT.GUILD_ID));
		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE,
		);

    if (notificationChannel?.isTextBased()) {
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
            value: `Seus CAM pendentes foram diminuídos para: ${MONETARY_INTL.format(amount ?? 0)}`,
          },
        ])
      ]});
    }
  }
}
