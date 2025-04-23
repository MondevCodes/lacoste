import { Listener, container } from "@sapphire/framework";

import { EmbedBuilder, GuildMember } from "discord.js";

import { ENVIRONMENT } from "$lib/env";
import { EmbedColors } from "$lib/constants/discord";

export class OnGuildMemberAddListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, {
      ...options,
      emitter: container.client,
      event: "guildMemberAdd",
    });
  }

  public override async run(member: GuildMember) {
    this.container.logger.info(member);
    if (member.guild.id !== ENVIRONMENT.LOG_GUILD_ID) return;
    this.container.logger.info(
      `Listener guildMemberAdd, a member join the server USER.ID: ${member.user.id}`
    );

    const mainServerGuildId = await this.container.client.guilds.fetch(
      ENVIRONMENT.GUILD_ID
    );

    const logServerGuildId = await this.container.client.guilds.fetch(
      member.guild.id
    );

    const notificationChannel = await logServerGuildId.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.WELCOME_LOG
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    const targetDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: member.user.id,
      },
      select: {
        latestPromotionJobId: true,
        latestPromotionRoleId: true,
        habboName: true,
        discordId: true,
      },
    });

    if (!targetDB) {
      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Automatizado por Lala 🤖" })
            .setTitle(`${member.user.globalName} chegou... adiantado. ⏰`)
            .setColor(EmbedColors.Error)
            .setDescription(
              `⛔ Erro: <@${member.id}> não está cadastrado em nosso banco de dados.`
            ),
        ],
      });

      return;
    }

    if (!targetDB?.latestPromotionJobId) return;
    if (!targetDB?.latestPromotionRoleId) return;

    let roleCargo: string | null = null;

    for (const roleId of [
      targetDB?.latestPromotionJobId,
      targetDB?.latestPromotionRoleId,
    ]) {
      const rolesMainServer =
        mainServerGuildId.roles.cache.get(roleId) ??
        (await mainServerGuildId.roles.fetch(roleId).catch(() => null));
      if (!rolesMainServer) {
        this.container.logger.warn(`Role ${roleId} not found on log server.`);
        continue;
      }

      const rolesToAdd = logServerGuildId.roles.cache.filter(
        (role) => role.name === rolesMainServer.name
      );

      if (!rolesToAdd.size) {
        this.container.logger.warn(
          `Not found role "${rolesMainServer.name}" on log server.`
        );
        continue;
      }

      for (const role of rolesToAdd.values()) {
        await member.roles
          .add(role)
          .catch((err) =>
            this.container.logger.error(`Failed to add role ${role.id}:`, err)
          );
        if (!roleCargo) roleCargo = role.id;
      }
    }

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(targetDB?.habboName)
    ).unwrapOr(undefined);

    await notificationChannel.send({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            name: "Automatizado por Lala 🤖",
          })
          .setTitle(`${targetDB?.habboName} chegou! 🪂`)
          .setColor(EmbedColors.LalaRed)
          .setDescription(
            `Discord: \n <@${targetDB.discordId}>` ??
              "* Não consegui encontrar o discord do usuário"
          )
          .addFields([
            {
              name: "💼 Cargo",
              value: `<@&${roleCargo}>` ?? "* Não consegui encontrar o cargo",
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
}
