import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
  GuildMemberRoleManager,
  type ButtonInteraction,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { getJobSectorsById } from "$lib/constants/jobs";
import { ENVIRONMENT } from "$lib/env";
import { FormIds } from "$lib/constants/forms";

export type Action = "Request" | "Approve" | "Reject";

export const BASE_BUTTON_ID = FormIds.Rebaixamento;
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

/** @internal @see {@link decodeButtonId} */
export function encodeButtonId(action: Action) {
  return `${BASE_BUTTON_ID}/${action}`;
}

/** @internal @see {@link encodeButtonId} */
export function decodeButtonId(id: string): Action {
  return id.replace(`${BASE_BUTTON_ID}/`, "") as Action;
}

type ParsedData = { action: Action };

const MODAL_INPUTS_OBJ = {
  Target: new TextInputBuilder()
    .setLabel("Rebaixado")
    .setPlaceholder("Informe o Habbo (Nick).")
    .setStyle(TextInputStyle.Short)
    .setCustomId("Target")
    .setRequired(true),

  Additional: new TextInputBuilder()
    .setStyle(TextInputStyle.Paragraph)
    .setLabel("Deseja adicionar alguma observação?")
    .setPlaceholder(
      "Se desejar, adicione informações extras aqui, se não deixe vazio"
    )
    .setCustomId("Additional")
    .setRequired(false),
} satisfies Record<string, TextInputBuilder | "GENERATED">;

const MODAL_INPUTS = Object.values(MODAL_INPUTS_OBJ);
type ModalInput = keyof typeof MODAL_INPUTS_OBJ;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DowngradeInteractionHandler extends InteractionHandler {
  async #isAuthorized(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) {
      this.container.logger.warn(
        `[DowngradeInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return false;
    }

    const { roles } =
      interaction.member ??
      (await interaction.guild.members.fetch(interaction.user.id));

    switch (decodeButtonId(interaction.customId)) {
      case "Request":
        return this.container.utilities.discord.hasPermissionByRole({
          checkFor: "INICIAL",
          category: "SECTOR",
          roles,
        });

      case "Reject":
      case "Approve":
        return this.container.utilities.discord.hasPermissionByRole({
          checkFor: "PRESIDÊNCIA",
          category: "SECTOR",
          roles,
        });

      default:
        throw new Error("Invalid Action");
    }
  }

  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();
    if (!(await this.#isAuthorized(interaction))) return this.none();

    return this.some({ action: decodeButtonId(interaction.customId) });
  }

  #APPROVAL_ROW = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeButtonId("Approve"))
      .setStyle(ButtonStyle.Success)
      .setLabel("Aprovar"),

    new ButtonBuilder()
      .setCustomId(encodeButtonId("Reject"))
      .setStyle(ButtonStyle.Danger)
      .setLabel("Reprovar")
  );

  public override async run(
    interaction: ButtonInteraction,
    { action }: ParsedData
  ) {
    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[DowngradeInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return;
    }

    const cachedGuild =
      interaction.guild ??
      (await this.container.client.guilds.fetch(interaction.guildId));

    if (action === "Request") {
      const { result, interaction: modalInteraction } =
        await this.container.utilities.inquirer.awaitModal<ModalInput>(
          interaction,
          {
            listenInteraction: true,
            inputs: MODAL_INPUTS,
            title: "Rebaixamento",
          }
        );

      const onlyHabbo = (
        await this.container.utilities.habbo.getProfile(result.Target)
      ).unwrapOr(undefined);

      // if (!onlyHabbo?.name) {
      //   await modalInteraction.editReply({
      //     content:
      //       "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
      //   });

      //   return;
      // }

      const targetDBOnlyHabbo = await this.container.prisma.user.findUnique({
        where: { habboName: result.Target },
        select: {
          id: true,
          discordId: true,
          latestPromotionDate: true,
          latestPromotionRoleId: true,
          latestPromotionJobId: true,
          habboName: true,
          discordLink: true,
        },
      });

      if (!targetDBOnlyHabbo) {
        await modalInteraction.editReply({
          content: `Não consegui encontrar o usuário **${result.Target}** como vinculado na nossa base de dados, verifique o nome e tente novamente.`,
        });

        return;
      }

      // START USER WITHOUT DISCORD
      if (targetDBOnlyHabbo?.discordLink === false) {
        const guild =
          interaction.guild ??
          (await interaction.client.guilds.fetch(interaction.guildId));

        if (!targetDBOnlyHabbo.latestPromotionRoleId) {
          await modalInteraction.editReply({
            content:
              "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
          });

          return;
        }

        const currentSectorEnvironment = Object.values(
          ENVIRONMENT.SECTORS_ROLES
        ).find((r) => r.id === targetDBOnlyHabbo.latestPromotionRoleId);

        if (!currentSectorEnvironment) {
          await modalInteraction.editReply({
            content:
              "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
          });

          return;
        }

        const currentSector = await guild.roles.fetch(
          currentSectorEnvironment?.id
        );

        const currentJobEnvironment = Object.values(
          ENVIRONMENT.JOBS_ROLES
        ).find((r) => r.id === targetDBOnlyHabbo.latestPromotionJobId);

        if (!currentJobEnvironment) {
          await modalInteraction.editReply({
            content:
              "Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
          });

          return;
        }

        const currentJob = await guild.roles.fetch(currentJobEnvironment?.id);

        if (!currentJob || !currentSector) {
          await modalInteraction.editReply({
            content: "||P94N|| Ocorreu um erro, contate o Desenvolvedor.",
          });

          return;
        }

        const jobRolesIds = new Set(
          Object.values(ENVIRONMENT.JOBS_ROLES)
            .filter((role) => role.index < currentJobEnvironment.index)
            .map((role) => role.id)
        );

        if (jobRolesIds.size === 0) {
          await modalInteraction.editReply({
            content:
              "Este colaborador não pode ser rebaixado pois já está no cargo mais baixo.",
          });

          return;
        }

        const jobsRoles = modalInteraction.guild?.roles.cache.filter((role) =>
          jobRolesIds.has(role.id)
        );

        if (!jobsRoles)
          throw new Error("Failed to get job roles, cache may be empty.");

        const [selectedJobId] =
          await this.container.utilities.inquirer.awaitSelectMenu(
            modalInteraction,
            {
              question: "Selecione o cargo para que deseja rebaixar.",
              placeholder: "Clique aqui para selecionar",
              choices: jobsRoles.map((role) => ({
                id: role.id,
                label: role.name,
              })),
            }
          );

        const selectedJob = jobsRoles.find((role) => role.id === selectedJobId);

        if (!selectedJob)
          throw new Error("Unexpected error while selecting job role.");

        const authorDB = await this.container.prisma.user.findUnique({
          where: {
            discordId: interaction.user.id,
          },
          select: {
            habboName: true,
          },
        });

        if (!authorDB) {
          await modalInteraction.editReply({
            content:
              "Não consegui encontrar o autor da requisição, contate o Desenvolvedor.",
            components: [],
            embeds: [],
          });

          return;
        }

        const confirmationEmbed = new EmbedBuilder()
          .setThumbnail(
            onlyHabbo
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
              : null
          )
          .setFooter({
            text: `${targetDBOnlyHabbo.habboName ?? onlyHabbo?.name}`,
          })
          .setTitle("Você tem certeza?")
          .setDescription(
            `Você está rebaixando ${targetDBOnlyHabbo.habboName} para <@&${selectedJob.id}>.`
          )
          .setColor(EmbedColors.Default);

        const { result: isConfirmed } =
          await this.container.utilities.inquirer.awaitButtons(
            modalInteraction,
            {
              question: {
                embeds: [confirmationEmbed],
              },
              choices: [
                {
                  id: "True" as const,
                  style: ButtonStyle.Success,
                  label: "Sim",
                },
                {
                  id: "False" as const,
                  style: ButtonStyle.Danger,
                  label: "Não",
                },
              ],
            }
          );

        if (isConfirmed === "False") {
          await modalInteraction.deleteReply();

          return;
        }

        const approvalChannel = await cachedGuild.channels.fetch(
          ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST
        );

        if (!approvalChannel?.isTextBased()) {
          throw new Error("Can't send message to non-text channel.");
        }

        const approvalEmbed = new EmbedBuilder()
          .setTitle(
            `Solicitação de Rebaixamento para ${
              targetDBOnlyHabbo.habboName ?? onlyHabbo?.name
            } como ${selectedJob.name}`
          )
          .setColor(EmbedColors.Default)
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setFooter({
            text: targetDBOnlyHabbo.id,
          })
          .addFields([
            {
              name: "👤 Rebaixador",
              value: authorDB.habboName,
            },
            {
              name: "📝 Cargo Anterior",
              value: `<@&${currentJobEnvironment.id}>`,
            },
            {
              name: "📗 Cargo Rebaixado",
              value: `<@&${selectedJob.id}>`,
            },
            {
              name: "🗒️ Observação Adicional",
              value:
                result.Additional.length > 0
                  ? result.Additional
                  : "* Não houve nenhuma observação.",
            },
          ])
          .setImage(
            onlyHabbo
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
              : null
          );

        await this.container.prisma.user.update({
          where: { id: targetDBOnlyHabbo.id },
          data: { pendingPromotionRoleId: selectedJob.id },
        });

        await approvalChannel.send({
          embeds: [approvalEmbed],
          components: [this.#APPROVAL_ROW],
          content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
        });

        await modalInteraction.editReply({
          content: "Solicitação enviada. ✅",
          components: [],
          embeds: [],
        });

        return;
        // END USER WITHOUT DISCORD
      }

      const { habbo: targetHabbo } =
        await this.container.utilities.habbo.inferTargetGuildMember(
          result.Target
        );

      const targetMember = await cachedGuild.members.fetch(
        targetDBOnlyHabbo.discordId
      );

      if (!targetMember) {
        await modalInteraction.editReply({
          content:
            "Não foi possível encontrar o usuário informado presente no Servidor.",
        });

        return;
      }

      const targetUserDb = await this.container.prisma.user.findUnique({
        where: {
          discordId: targetMember.id,
        },
        select: {
          id: true,
          discordId: true,
          latestPromotionDate: true,
          latestPromotionRoleId: true,
          latestPromotionJobId: true,
          habboName: true,
        },
      });

      if (!targetUserDb) {
        await modalInteraction.editReply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          components: [],
          embeds: [],
        });

        return;
      }

      const targetUser = await cachedGuild.members.fetch(
        targetUserDb.discordId
      );

      if (!targetUser) {
        await modalInteraction.editReply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          components: [],
          embeds: [],
        });
      }

      const currentJobRoleIndex =
        Object.values(ENVIRONMENT.JOBS_ROLES).find(
          (role) => role.id === targetUserDb.latestPromotionJobId
        )?.index ?? 0;

      const currentJobRoleId =
        this.container.utilities.discord.inferHighestJobRole(
          targetUser.roles.cache.map((x) => x.id)
        );

      const jobRolesIds = new Set(
        Object.values(ENVIRONMENT.JOBS_ROLES)
          .filter((role) => role.index < currentJobRoleIndex)
          .map((role) => role.id)
      );

      if (jobRolesIds.size === 0) {
        await modalInteraction.editReply({
          content:
            "Este colaborador não pode ser rebaixado pois já está no cargo mais baixo.",
        });

        return;
      }

      const jobsRoles = modalInteraction.guild?.roles.cache.filter((role) =>
        jobRolesIds.has(role.id)
      );

      if (!jobsRoles)
        throw new Error("Failed to get job roles, cache may be empty.");

      const [selectedJobId] =
        await this.container.utilities.inquirer.awaitSelectMenu(
          modalInteraction,
          {
            question: "Selecione o cargo para que deseja rebaixar.",
            placeholder: "Clique aqui para selecionar",
            choices: jobsRoles.map((role) => ({
              id: role.id,
              label: role.name,
            })),
          }
        );

      const selectedJob = jobsRoles.find((role) => role.id === selectedJobId);

      if (!selectedJob)
        throw new Error("Unexpected error while selecting job role.");

      const authorDB = await this.container.prisma.user.findUnique({
        where: {
          discordId: interaction.user.id,
        },
        select: {
          habboName: true,
        },
      });

      if (!authorDB) {
        await modalInteraction.editReply({
          content:
            "Não consegui encontrar o autor da requisição, contate o Desenvolvedor.",
          components: [],
          embeds: [],
        });

        return;
      }

      const confirmationEmbed = new EmbedBuilder()
        .setThumbnail(
          targetHabbo
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`
            : null
        )
        .setFooter({
          text: `@${targetMember.user.tag} | ${
            targetUserDb.habboName ?? targetHabbo?.name
          }`,
          iconURL: targetMember.displayAvatarURL(),
        })
        .setTitle("Você tem certeza?")
        .setDescription(
          `Você está rebaixando ${
            targetUserDb.habboName ?? targetHabbo?.name
          } para <@&${selectedJob.id}>.`
        )
        .setColor(EmbedColors.Default);

      const { result: isConfirmed } =
        await this.container.utilities.inquirer.awaitButtons(modalInteraction, {
          question: {
            embeds: [confirmationEmbed],
          },
          choices: [
            {
              id: "True" as const,
              style: ButtonStyle.Success,
              label: "Sim",
            },
            {
              id: "False" as const,
              style: ButtonStyle.Danger,
              label: "Não",
            },
          ],
        });

      if (isConfirmed === "False") {
        await modalInteraction.deleteReply();

        return;
      }

      const approvalChannel = await cachedGuild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST
      );

      if (!approvalChannel?.isTextBased()) {
        throw new Error("Can't send message to non-text channel.");
      }

      const approvalEmbed = new EmbedBuilder()
        .setTitle(
          `Solicitação de Rebaixamento para ${
            targetUserDb.habboName ?? targetHabbo?.name
          } como ${selectedJob.name}`
        )
        .setColor(EmbedColors.Default)
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setFooter({
          text: targetUserDb.id,
        })
        .addFields([
          {
            name: "👤 Rebaixador",
            value: authorDB.habboName,
          },
          {
            name: "📝 Cargo Anterior",
            value: `<@&${currentJobRoleId}>`,
          },
          {
            name: "📗 Cargo Rebaixado",
            value: `<@&${selectedJob.id}>`,
          },
          {
            name: "🗒️ Observação Adicional",
            value:
              result.Additional.length > 0
                ? result.Additional
                : "* Não houve nenhuma observação.",
          },
        ])
        .setImage(
          targetHabbo
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`
            : null
        );

      await this.container.prisma.user.update({
        where: { id: targetUserDb.id },
        data: { pendingPromotionRoleId: selectedJob.id },
      });

      await approvalChannel.send({
        embeds: [approvalEmbed],
        components: [this.#APPROVAL_ROW],
        content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
      });

      await modalInteraction.editReply({
        content: "Solicitação enviada. ✅",
        components: [],
        embeds: [],
      });

      return;
    }

    const targetUserId = interaction.message.embeds[0].footer?.text;

    if (!targetUserId) {
      await interaction.followUp({
        content: "Ocorreu um erro, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    if (action === "Reject") {
      await interaction.message.delete();

      await this.container.prisma.user.update({
        where: { id: targetUserId },
        data: { pendingPromotionRoleId: null },
      });

      return;
    }

    if (action === "Approve") {
      const notificationChannel = await cachedGuild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FIRE
      );

      if (!notificationChannel?.isTextBased()) {
        throw new Error("Can't send message to non-text channel.");
      }

      const targetUser = await this.container.prisma.user.findUnique({
        where: {
          id: targetUserId,
          pendingPromotionRoleId: { not: null },
        },
      });

      if (!targetUser) {
        await interaction.message.edit({
          content: "Ocorreu um erro, contate o desenvolvedor.",
        });

        return;
      }

      const guild =
        interaction.guild ??
        (await interaction.client.guilds.fetch(interaction.guildId));

      if (!targetUser.pendingPromotionRoleId) {
        await interaction.message.edit({
          content: "Ocorreu um erro, contate o desenvolvedor.",
        });

        return;
      }

      const pendingPromotionRole = await guild.roles.fetch(
        targetUser.pendingPromotionRoleId
      );

      if (!pendingPromotionRole) {
        await interaction.message.edit({
          content:
            "Não consegui encontrar o cargo pendente, contate o desenvolvedor.",
        });

        return;
      }

      const sectorRoleKey = getJobSectorsById(
        targetUser.pendingPromotionRoleId
      );

      const sectorRole =
        sectorRoleKey &&
        (await guild.roles.fetch(ENVIRONMENT.SECTORS_ROLES[sectorRoleKey].id));

      if (!sectorRole) {
        await interaction.message.edit({
          content:
            "Não consegui encontrar o setor da contratação, contate o desenvolvedor.",
        });

        return;
      }

      if (targetUser.discordLink !== false) {
        const targetDiscordMember = await guild.members.fetch(
          targetUser.discordId
        );

        const previousJobRole = this.#inferHighestJobRole(
          targetDiscordMember.roles
        );

        if (!previousJobRole) {
          this.container.logger.error(
            "[DowngradeInteractionHandler#run] Error to find previousJobRole"
          );

          return;
        }

        const previousSectorRoleKey = getJobSectorsById(previousJobRole.id);

        const previousSectorRole =
          previousSectorRoleKey &&
          (await guild.roles.fetch(
            ENVIRONMENT.SECTORS_ROLES[previousSectorRoleKey].id
          ));

        if (!previousSectorRole) {
          this.container.logger.error(
            "[DowngradeInteractionHandler#run] Error to find previousSectorRole"
          );

          return;
        }

        await guild.members.removeRole({
          user: targetUser.discordId,
          role: previousJobRole.id,
        });

        await guild.members.removeRole({
          user: targetUser.discordId,
          role: previousSectorRole?.id,
        });

        const latestPromotionRole =
          targetUser.latestPromotionRoleId &&
          (await guild.roles.fetch(targetUser.latestPromotionRoleId));

        if (latestPromotionRole) {
          await guild.members.removeRole({
            user: targetUser.discordId,
            role: latestPromotionRole,
          });
        }

        if (sectorRole)
          await guild.members.addRole({
            user: targetUser.discordId,
            role: sectorRole,
          });

        await guild.members.addRole({
          role: pendingPromotionRole,
          user: targetUser.discordId,
        });
      }

      await this.container.prisma.user.update({
        where: { id: targetUserId },
        data: {
          latestPromotionRoleId: sectorRole?.id,
          latestPromotionJobId: pendingPromotionRole.id,
          pendingPromotionRoleId: null,
        },
      });

      const authorApprovedDB = await this.container.prisma.user.findUnique({
        where: {
          discordId: interaction.user.id,
        },
        select: {
          habboName: true,
        },
      });

      if (!authorApprovedDB) {
        await interaction.message.edit({
          content:
            "Não consegui encontrar o autor da aprovação, contate o Desenvolvedor.",
          components: [],
          embeds: [],
        });

        return;
      }

      await notificationChannel.send({
        embeds: [
          EmbedBuilder.from(interaction.message.embeds[0])
            .setTitle(`Rebaixamento de ${targetUser.habboName}`)
            .addFields([
              {
                name: "🛡️ Autorizado Por",
                value: authorApprovedDB?.habboName,
              },
            ])
            .setColor(EmbedColors.LalaRed),
        ],
      });

      await interaction.message.delete();

      return;
    }
  }

  #inferHighestJobRole(roles: GuildMemberRoleManager) {
    const jobRoles = roles.cache.filter((role) =>
      Object.values(ENVIRONMENT.JOBS_ROLES).some((r) => r.id === role.id)
    );

    if (jobRoles.size === 0) return null;

    return jobRoles.reduce((highest, current) => {
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
  }
}
