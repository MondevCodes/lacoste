import {
  InteractionHandler,
  InteractionHandlerTypes,
  Result,
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
import { PromotionInteractionHandler } from "../../work/interactions/promotion";

export type Action = "Request" | "Approve" | "Reject";

export const BASE_BUTTON_ID = "LCST::HireInteractionHandler";
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
    .setLabel("Contratado")
    .setPlaceholder("Informe o Habbo (Nick).")
    .setStyle(TextInputStyle.Short)
    .setCustomId("Target")
    .setRequired(true),

  Additional: new TextInputBuilder()
    .setStyle(TextInputStyle.Paragraph)
    .setLabel("Deseja adicionar alguma observação?")
    .setPlaceholder("Se desejar, adicione informações extras aqui.")
    .setCustomId("Additional")
    .setRequired(false),
} satisfies Record<string, TextInputBuilder | "GENERATED">;

const MODAL_INPUTS = Object.values(MODAL_INPUTS_OBJ);
type ModalInput = keyof typeof MODAL_INPUTS_OBJ;

let habboInteractionName: string | undefined = undefined;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class HireInteractionHandler extends InteractionHandler {
  private promotionHandler: PromotionInteractionHandler;
  constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, options);
    this.promotionHandler = new PromotionInteractionHandler(context, options);
  }

  async #isAuthorized(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) {
      this.container.logger.warn(
        `[HireInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
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
          checkFor: "FUNDAÇÃO",
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
        `[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
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
            title: "Contratação",
          }
        );

      const onlyHabbo = (
        await this.container.utilities.habbo.getProfile(result.Target)
      ).unwrapOr(undefined);

      if (!onlyHabbo?.name) {
        await modalInteraction.editReply({
          content:
            "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
        });

        return;
      }

      const targetDBOnlyHabbo = await this.container.prisma.user.findUnique({
        where: { habboId: onlyHabbo.uniqueId },
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
            .filter((role) => role.index > currentJobEnvironment.index)
            .map((role) => role.id)
        );

        if (jobRolesIds.size === 0) {
          await modalInteraction.reply({
            content:
              "Este colaborador não pode ser contratado pois já é o cargo mais alto.",
            ephemeral: true,
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
              question: "Selecione o cargo que deseja contratar.",
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

        const authorResult = await Result.fromAsync(
          this.container.utilities.habbo.inferTargetGuildMember(
            `@${interaction.user.tag}`,
            true
          )
        );

        if (authorResult) {
          const { habbo: authorHabbo } = authorResult.unwrapOr({
            member: undefined,
            habbo: undefined,
          });

          habboInteractionName = authorHabbo?.name ?? "N/A";
        }

        const confirmationEmbed = new EmbedBuilder()
          .setThumbnail(
            `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo.figureString}`
          )
          .setFooter({
            text: `${onlyHabbo.name ?? targetDBOnlyHabbo.habboName}`,
          })
          .setTitle("Você tem certeza?")
          .setDescription(
            `Você está contratando ${onlyHabbo.name} como <@&${selectedJob.id}>.`
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

        const authorDB = await this.container.prisma.user.findUnique({
          where: { discordId: interaction.user.id },
          select: { habboName: true },
        });

        const approvalEmbed = new EmbedBuilder()
          .setTitle(
            `Solicitação de Contratação para ${onlyHabbo.name} como ${selectedJob.name}`
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
              name: "👤 Contratante",
              value: `${
                authorDB.habboName ??
                habboInteractionName ??
                `@${interaction.user.tag}`
              }`,
            },
            {
              name: "📗 Novo Cargo",
              value: `<@&${selectedJob.id}>`,
            },
            {
              name: "🗒️ Observação Adicional",
              value: result.Additional === "" ? "N/A" : result.Additional,
            },
            {
              name: "🗓️ Última Promoção",
              value:
                targetDBOnlyHabbo.latestPromotionDate?.toLocaleString(
                  "pt-BR"
                ) ?? "N/A",
              inline: true,
            },
            {
              name: "🗓️ Promoção Atual",
              value: new Date().toLocaleString("pt-BR"),
              inline: true,
            },
          ])
          .setImage(
            `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
          );

        await this.container.prisma.user.update({
          where: { id: targetDBOnlyHabbo.id },
          data: { pendingPromotionRoleId: selectedJob.id },
        });

        await approvalChannel.send({
          embeds: [approvalEmbed],
          components: [this.#APPROVAL_ROW],
          content: `Apenas para <@&${ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id}>`,
        });

        await modalInteraction.deleteReply();

        return;
        // END USER WITHOUT DISCORD
      }

      const { member: targetMember, habbo: targetHabbo } =
        await this.container.utilities.habbo.inferTargetGuildMember(
          result.Target
        );

      if (!targetMember) {
        await modalInteraction.editReply({
          content: "Não foi possível encontrar o usuário informado.",
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
        },
      });

      if (!targetUserDb) {
        await modalInteraction.reply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          ephemeral: true,
        });

        return;
      }

      const targetUser = await cachedGuild.members.fetch(
        targetUserDb.discordId
      );

      if (!targetUser) {
        await modalInteraction.reply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          ephemeral: true,
        });
      }

      const currentJobRoleIndex =
        Object.values(ENVIRONMENT.JOBS_ROLES).find(
          (role) => role.id === targetUserDb.latestPromotionJobId
        )?.index ?? 0;

      const jobRolesIds = new Set(
        Object.values(ENVIRONMENT.JOBS_ROLES)
          .filter((role) => role.index > currentJobRoleIndex)
          .map((role) => role.id)
      );

      if (jobRolesIds.size === 0) {
        await modalInteraction.reply({
          content:
            "Este colaborador não pode ser contratado pois já é o cargo mais alto.",
          ephemeral: true,
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
            question: "Selecione o cargo que deseja contratar.",
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

      const authorResult = await Result.fromAsync(
        this.container.utilities.habbo.inferTargetGuildMember(
          `@${interaction.user.tag}`,
          true
        )
      );

      if (authorResult) {
        const { habbo: authorHabbo } = authorResult.unwrapOr({
          member: undefined,
          habbo: undefined,
        });

        habboInteractionName = authorHabbo?.name ?? "N/A";
      }

      const confirmationEmbed = new EmbedBuilder()
        .setThumbnail(
          `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`
        )
        .setFooter({
          text: `@${targetMember.user.tag} | ${targetHabbo?.name ?? "N/D"}`,
          iconURL: targetMember.displayAvatarURL(),
        })
        .setTitle("Você tem certeza?")
        .setDescription(
          `Você está contratando ${targetHabbo?.name} como <@&${selectedJob.id}>.`
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

      const authorDB = await this.container.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        select: { habboName: true },
      });

      const approvalEmbed = new EmbedBuilder()
        .setTitle(
          `Solicitação de Contratação para ${targetHabbo?.name} como ${selectedJob.name}`
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
            name: "👤 Contratante",
            value: `${
              authorDB.habboName ??
              habboInteractionName ??
              `@${interaction.user.tag}`
            }`,
          },
          {
            name: "📗 Novo Cargo",
            value: `<@&${selectedJob.id}>`,
          },
          {
            name: "🗒️ Observação Adicional",
            value: result.Additional === "" ? "N/A" : result.Additional,
          },
          {
            name: "🗓️ Última Promoção",
            value:
              targetUserDb.latestPromotionDate?.toLocaleString("pt-BR") ??
              "N/A",
            inline: true,
          },
          {
            name: "🗓️ Promoção Atual",
            value: new Date().toLocaleString("pt-BR"),
            inline: true,
          },
        ])
        .setImage(
          `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
        );

      await this.container.prisma.user.update({
        where: { id: targetUserDb.id },
        data: { pendingPromotionRoleId: selectedJob.id },
      });

      await approvalChannel.send({
        embeds: [approvalEmbed],
        components: [this.#APPROVAL_ROW],
        content: `Apenas para <@&${ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id}>`,
      });

      await modalInteraction.deleteReply();

      return;
    }

    // ---------------------
    // -  Handle Approval  -
    // ---------------------

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

    const notificationChannel = await cachedGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_HIRE
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
      await interaction.reply({
        content: "Ocorreu um erro, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    if (!targetUser.pendingPromotionRoleId) {
      await interaction.reply({
        content: "Ocorreu um erro, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    const pendingPromotionRole = await guild.roles.fetch(
      targetUser.pendingPromotionRoleId
    );

    if (!pendingPromotionRole) {
      await interaction.reply({
        content:
          "Não consegui encontrar o cargo pendente, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    const sectorRoleKey = getJobSectorsById(targetUser.pendingPromotionRoleId);

    const sectorRole =
      sectorRoleKey &&
      (await guild.roles.fetch(ENVIRONMENT.SECTORS_ROLES[sectorRoleKey].id));

    if (!sectorRole) {
      await interaction.reply({
        content:
          "Não consegui encontrar o setor da contratação, contate o desenvolvedor.",
        ephemeral: true,
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
          "[HireInteractionHandler#run] Error to find previousJobRole"
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
          "[HireInteractionHandler#run] Error to find previousSectorRole"
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

      const hasInitialSectorRole = (
        await guild.members.fetch(targetUser.discordId)
      ).roles.cache.has(ENVIRONMENT.SECTORS_ROLES.INICIAL.id);

      const hasInitialJobRole = (
        await guild.members.fetch(targetUser.discordId)
      ).roles.cache.has(ENVIRONMENT.JOBS_ROLES.VINCULADO.id);

      if (
        hasInitialSectorRole &&
        sectorRole?.id !== ENVIRONMENT.SECTORS_ROLES.INICIAL.id
      ) {
        await guild.members.removeRole({
          user: targetUser.discordId,
          role: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
        });
      }

      if (
        hasInitialJobRole &&
        pendingPromotionRole?.id !== ENVIRONMENT.JOBS_ROLES.VINCULADO.id
      ) {
        await guild.members.removeRole({
          user: targetUser.discordId,
          role: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
        });
      }

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

    const userUpdated = await this.container.prisma.user.update({
      where: { id: targetUserId },
      data: {
        latestPromotionDate: new Date(),
        latestPromotionRoleId: sectorRole?.id,
        latestPromotionJobId: pendingPromotionRole.id,
        pendingPromotionRoleId: null,
      },
    });

    const habboTargetProfile = (
      await this.container.utilities.habbo.getProfile(targetUser.habboId)
    ).unwrapOr(null);

    if (targetUser.latestPromotionJobId && targetUser.latestPromotionRoleId)
      await this.promotionHandler.updateDiscordLogRole("HIRE", userUpdated, [
        targetUser.latestPromotionJobId,
        targetUser.latestPromotionRoleId,
      ]);

    const authorResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true
      )
    );

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

    const authorDB = await this.container.prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { habboName: true },
    });

    await notificationChannel.send({
      embeds: [
        EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle(
            `Contratação de ${habboTargetProfile?.name ?? targetUser.habboName}`
          )
          .addFields([
            {
              name: "🛡️ Autorizado Por",
              value: `${
                authorDB.habboName ??
                habboInteractionName ??
                `@${interaction.user.tag}`
              }`,
            },
          ])
          .setColor(EmbedColors.Hire),
      ],
    });

    await interaction.message.delete();

    return;
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
