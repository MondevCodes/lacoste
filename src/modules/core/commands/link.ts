import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import {
  EmbedBuilder,
  GuildMemberRoleManager,
  type ChatInputCommandInteraction,
} from "discord.js";

@ApplyOptions<Command.Options>({
  name: "vincular",
  description: "Vincula um usuário do Habbo a Lacoste",
})
export class LinkCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    const isProduction =
      this.container.utilities.discord.verifyInjectSlashCommands(
        ENVIRONMENT.NODE_ENV
      );

    if (!isProduction) return;

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((option) =>
          option
            .setName("nick_habbo")
            .setDescription("Nickname do usuário no Habbo")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("usuario_discord")
            .setDescription("Usuário do Discord para vincular")
            .setRequired(false)
        )
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const interactionId = interaction.user.id;

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[LinkCommand#chatInputRun] ${interactionId} tried to perform an action in a DM.`
      );
      return;
    }

    const cachedGuild =
      interaction.guild ??
      (await this.container.client.guilds.fetch(interaction.guildId));

    const author =
      interaction.member ??
      (await interaction.guild?.members.fetch(interaction.user.id));

    const authorDB = await this.container.prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { habboName: true },
    });

    const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
      category: "SECTOR",
      checkFor: "PROMOCIONAL",
      roles: author.roles as GuildMemberRoleManager,
    });

    if (!isAuthorized) {
      this.container.logger.info(
        `[LinkCommand#chatInputRun] ${interaction.member?.user.id} tried to perform an action without permission.`
      );
      return;
    }

    const habboNick = interaction.options.getString("nick_habbo", true);
    const discordUser = interaction.options.getUser("usuario_discord", false);

    this.container.logger.info(
      `[LinkCommand#chatInputRun] habboNick: ${habboNick}, discordUser: ${discordUser?.id}`
    );

    // START MEMBER WITHOUT DISCORD
    if (!discordUser) {
      const profileResult = await this.container.utilities.habbo.getProfile(
        habboNick
      );

      if (profileResult.isErr()) {
        this.container.logger.info({
          err: profileResult.unwrapErr(),
        });

        await interaction.reply({
          content:
            "Não consegui encontrar o perfil do usuário no Habbo, verifique o nome e veja se o perfil do usuário no jogo está como público.",
        });

        return;
      }

      const profile = profileResult.unwrap();

      const existingUser = await this.container.prisma.user.findUnique({
        where: { habboId: profile.uniqueId },
        select: {
          habboId: true,
          discordId: true,
          latestPromotionRoleId: true,
          discordLink: true,
          habboName: true,
        },
      });

      if (existingUser) {
        if (existingUser.discordLink) {
          await interaction.reply({
            content: `O usuário **${existingUser.habboName}** já está totalmente vinculado _(Habbo e Discord)_`,
          });
        } else {
          await interaction.reply({
            content: `Este usuário já está vinculado sem o Discord. Caso queira vincular o Discord utilize: `,
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  `/vincular [nick_habbo]**${
                    existingUser.habboName ?? profile.name
                  }** [usuario_discord]**NickNoDiscord**`
                )
                .setColor(EmbedColors.LalaRed),
            ],
          });
        }

        return;
      } else {
        await this.container.prisma.user
          .create({
            data: {
              discordId: profile.uniqueId,
              habboId: profile.uniqueId,
              habboName: profile.name,
              latestPromotionDate: new Date(),
              latestPromotionRoleId: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
              latestPromotionJobId: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
              discordLink: false,
            },
          })
          .catch((error) => {
            this.container.logger.error(
              `[LinkCommand#messageRun] Error trying creating user without Discord: ${error}`
            );

            return;
          });
      }

      const notificationChannel = await cachedGuild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED
      );

      if (!notificationChannel?.isTextBased()) {
        throw new Error("Can't send message to non-text channel.");
      }

      const embed = new EmbedBuilder()
        .setColor(EmbedColors.LalaRed)
        .setAuthor({
          name: `${existingUser ? "Revinculado" : "Vinculado"} por ${
            authorDB.habboName
          }`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .addFields([
          { name: "Habbo", value: profile.name, inline: true },
          { name: "Discord", value: "Ainda não vinculado", inline: true },
        ])
        .setThumbnail(
          profile
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.figureString}&size=b&gesture=std`
            : null
        );

      await interaction.reply({
        content:
          "⚠️ Não consegui identificar o Discord do usuário, então foi vinculado apenas o Habbo.",
        ephemeral: true,
      });

      await notificationChannel.send({
        embeds: [embed],
      });

      return;
      // END USER WITHOUT DISCORD
    }

    const profileResult = await this.container.utilities.habbo.getProfile(
      habboNick
    );

    if (profileResult.isErr()) {
      this.container.logger.info({
        err: profileResult.unwrapErr(),
      });

      await interaction.reply({
        content:
          "Não consegui encontrar o perfil do usuário no Habbo, verifique o nome e veja se o perfil do usuário no jogo está como público.",
      });

      return;
    }

    const member = discordUser;
    const profile = profileResult.unwrap();

    const roles = (
      await interaction.guild.members.fetch(member.id)
    ).roles.cache.map((role) => role.id);

    const existingUser = await this.container.prisma.user.findUnique({
      where: { habboId: profile.uniqueId },
      select: {
        habboId: true,
        discordId: true,
        latestPromotionRoleId: true,
        latestPromotionJobId: true,
        discordLink: true,
      },
    });

    const existingUserDiscord = await this.container.prisma.user.findUnique({
      where: { discordId: member.id },
      select: {
        habboId: true,
        discordId: true,
        latestPromotionRoleId: true,
        habboName: true,
      },
    });

    if (existingUserDiscord) {
      await interaction.reply({
        content: `Este perfil do Discord já está totalmente vinculado com a conta do Habbo **${existingUserDiscord.habboName}**`,
      });

      return;
    }

    const highestJob =
      this.container.utilities.discord.inferHighestJobRole(roles);

    const highestSector =
      this.container.utilities.discord.inferHighestSectorRole(roles);

    for await (const role of ENVIRONMENT.DEFAULT_ROLES) {
      await cachedGuild.members
        .addRole({
          user: member,
          role,
        })
        .catch(() => {
          this.container.logger.info(`Role ${role} already exists`);
        });
    }

    this.container.logger.info(
      `Sector = ${highestSector}`,
      `Job = ${highestJob}`
    );
    if (!existingUser?.latestPromotionRoleId) {
      await cachedGuild.members
        .addRole({
          user: member,
          role: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
        })
        .catch(() => {
          this.container.logger.info("Sector Inicial role already exists");
        });
      this.container.logger.info("Sector Inicial role Added");

      await cachedGuild.members
        .addRole({
          user: member,
          role: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
        })
        .catch(() => {
          this.container.logger.info("Job Vinculado role already exists");
        });
      this.container.logger.info("Job Vinculado role Added");

      if (existingUser) {
        await this.container.prisma.user.update({
          where: {
            habboId: profile.uniqueId,
          },
          data: {
            latestPromotionDate: new Date(),
            latestPromotionRoleId: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
            latestPromotionJobId: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
          },
        });

        await interaction.reply({
          content: `Algo aconteceu com os dados do usuário, ele foi resetado para o cargo VINCULADO no Banco de Dados e atribuido os respectivos cargos.`,
        });
      }
    }

    await cachedGuild.members
      .edit(member, {
        nick: `· ${profile.name}`,
      })
      .catch(() => {
        this.container.logger.warn(
          "[LinkCommand#messageRun] Failed to edit user nick."
        );
      });

    if (existingUser?.discordLink === false) {
      if (
        !existingUser.latestPromotionJobId ||
        !existingUser.latestPromotionRoleId
      ) {
        await interaction.reply({
          content: `Ocorreu um erro inesperado, contate o Desenvolvedor.`,
        });

        return;
      }

      await this.container.prisma.user
        .update({
          where: { habboId: existingUser.habboId },
          data: { discordId: member.id, discordLink: true },
        })
        .catch(() => {
          throw new Error("Failed to update user.");
        });

      await cachedGuild.members
        .addRole({
          user: member,
          role: existingUser.latestPromotionJobId,
        })
        .catch(() => {
          throw new Error("Failed to add user job.");
        });
      await cachedGuild.members
        .addRole({
          user: member,
          role: existingUser.latestPromotionRoleId,
        })
        .catch(() => {
          throw new Error("Failed to add user role.");
        });
    } else if (existingUser) {
      await this.container.prisma.user
        .update({
          where: { discordId: existingUser.discordId },
          data: {
            habboId: profile.uniqueId,
            habboName: profile.name,
            discordLink: true,
          },
        })
        .catch(() => {
          throw new Error("Failed to update user.");
        });
    } else {
      await this.container.prisma.user
        .create({
          data: {
            habboId: profile.uniqueId,
            discordId: member.id,
            habboName: profile.name,
            latestPromotionDate: new Date(),
            latestPromotionRoleId: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
            latestPromotionJobId: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
            discordLink: true,
          },
        })
        .catch(() => {
          throw new Error("Failed to create user.");
        });
    }

    const notificationChannel = await interaction.guild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    const embed = new EmbedBuilder()
      .setColor(EmbedColors.LalaRed)
      .setAuthor({
        name: `${existingUser ? "Revinculado" : "Vinculado"} por ${
          authorDB.habboName
        }`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .addFields([
        { name: "Habbo", value: profile.name, inline: true },
        { name: "Discord", value: `<@${member.id}>`, inline: true },
      ])
      .setThumbnail(
        profile
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.figureString}&size=b&gesture=std`
          : null
      );

    await notificationChannel.send({
      embeds: [embed],
    });

    await interaction.reply({
      content: `✅ Vinculado com sucesso!`,
      ephemeral: true,
    });
  }
}
