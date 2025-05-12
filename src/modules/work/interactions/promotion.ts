import {
  InteractionHandler,
  InteractionHandlerTypes,
  container,
  Result,
} from "@sapphire/framework";

import {
  time,
  Role,
  Snowflake,
  ButtonStyle,
  EmbedBuilder,
  TextInputStyle,
  TextInputBuilder,
  ButtonInteraction,
  RepliableInteraction,
  GuildMember,
  GuildMemberRoleManager,
  DMChannel,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";

import { find, values } from "remeda";
import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { getJobSectorsById } from "$lib/constants/jobs";
import { ButtonValue } from "$lib/utilities/inquirer";
import { User } from "@prisma/client";

type InGuild = "cached" | "raw";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PromotionInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match("LCST::PromotionInteractionHandler")) {
      return this.none();
    }

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[PromotionInteractionHandler#parse] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return this.none();
    }

    const { members } =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const { roles } =
      "toJSON" in interaction.member
        ? interaction.member
        : await members.fetch(interaction.user.id);

    const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
      checkFor: "PROMOCIONAL",
      category: "SECTOR",
      roles,
    });

    return isAuthorized ? this.some() : this.none();
  }

  public override async run(interaction: ButtonInteraction<InGuild>) {
    const { interaction: interactionFromModal, result } =
      await this.container.utilities.inquirer.awaitModal(interaction, {
        title: "Promover",
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId("target")
            .setLabel("Promovido")
            .setPlaceholder("Informe o Habbo (Nick).")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("additional")
            .setLabel("Deseja adicionar alguma observação?")
            .setPlaceholder("Se desejar, adicione informações extras aqui.")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ],
      });

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(result.target)
    ).unwrapOr(undefined);

    if (!onlyHabbo?.name) {
      await interactionFromModal.editReply({
        content:
          "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
      });

      return;
    }

    const targetDB = await this.container.prisma.user.findUnique({
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
    if (targetDB?.discordLink === false) {
      const guild =
        interaction.guild ??
        (await interaction.client.guilds.fetch(interaction.guildId));

      if (!targetDB.latestPromotionRoleId) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentSectorEnvironment = Object.values(
        ENVIRONMENT.SECTORS_ROLES
      ).find((r) => r.id === targetDB.latestPromotionRoleId);

      if (!currentSectorEnvironment) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentSector = await guild.roles.fetch(
        currentSectorEnvironment?.id
      );

      const currentJobEnvironment = Object.values(ENVIRONMENT.JOBS_ROLES).find(
        (r) => r.id === targetDB.latestPromotionJobId
      );

      if (!currentJobEnvironment) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o cargo do usuário, talvez sua conta esteja deletada ou renomeada?",
        });

        return;
      }

      const currentJob = await guild.roles.fetch(currentJobEnvironment?.id);

      if (!currentJob || !currentSector) {
        await interactionFromModal.editReply({
          content: "||P94N|| Ocorreu um erro, contate o Desenvolvedor.",
        });

        return;
      }

      const currentRoleSearch = Object.values(ENVIRONMENT.JOBS_ROLES).find(
        (r) => r.id === currentJob.id
      );

      if (!currentRoleSearch) {
        await interactionFromModal.editReply({
          content: "||P95N|| Ocorreu um erro, contate o Desenvolvedor.",
        });

        return;
      }

      const nextRole = Object.values(ENVIRONMENT.JOBS_ROLES)
        .sort((a, b) => a.index - b.index)
        .find((role) => role.index > currentRoleSearch.index);

      if (!nextRole) {
        await interactionFromModal.editReply({
          content: "||P96N|| Ocorreu um erro, contate o Desenvolvedor.",
        });

        return;
      }

      const targetJobRole =
        nextRole.id && (await guild.roles.fetch(nextRole.id));

      const author = await guild.members.fetch(interaction.user.id);

      const authorJobRole =
        this.container.utilities.discord.inferHighestJobRole(
          author.roles.cache.map((r) => r.id)
        );

      const authorJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
        (job) => job.id === authorJobRole
      );

      const hasEnoughHierarchy =
        (currentJobEnvironment?.index ?? 0) <= (authorJob?.promoteIndex ?? -1);

      if (!hasEnoughHierarchy || !targetJobRole) {
        const author = await guild.members.fetch(interaction.user.id);

        const authorJobRoleGuild =
          authorJobRole && (await author.guild.roles.fetch(authorJobRole));

        await interactionFromModal.editReply({
          content: `Seu cargo de ${authorJobRoleGuild} não tem permissão para promover alguém para o cargo de ${targetJobRole}`,
        });

        this.container.logger.info(
          `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`
        );

        return;
      }

      if (!targetDB) {
        await interactionFromModal.editReply({
          content:
            "||WP157|| Usuário não encontrado na base de dados, use `vincular`.",
        });

        return;
      }

      const latestPromotionDate =
        targetDB?.latestPromotionDate &&
        new Date(targetDB?.latestPromotionDate);

      const minDaysProm = find(
        values(ENVIRONMENT.JOBS_ROLES),
        (x) => x.id === currentJob.id
      )?.minDaysProm;

      if (latestPromotionDate && minDaysProm) {
        const daysSinceLastPromotion = Math.floor(
          (new Date().getTime() - latestPromotionDate.getTime()) /
            (1000 * 3600 * 24)
        );

        const shouldPromote = daysSinceLastPromotion >= minDaysProm;

        if (!shouldPromote) {
          await interactionFromModal.editReply({
            content: `🕝 O usuário tem que aguardar pelo menos ${
              minDaysProm - daysSinceLastPromotion
            } dia para poder promover de cargo.`,
          });

          return;
        }
      }

      const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
        interactionFromModal,
        {
          choices: [
            {
              id: "true",
              label: "Sim",
              style: ButtonStyle.Success,
            },
            {
              id: "false",
              label: "Não",
              style: ButtonStyle.Danger,
            },
          ] as ButtonValue[],
          question: {
            embeds: [
              new EmbedBuilder()
                .setTitle("Promover")
                .setDescription(
                  `Promover ${onlyHabbo.name} para ${targetJobRole}?`
                )
                .setThumbnail(
                  `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                )
                .setColor(EmbedColors.Default),
            ],
          },
        }
      );

      if (isConfirmed.result === "false") {
        await interactionFromModal
          .deleteReply()
          .catch(() =>
            this.container.logger.error(
              "[PromotionInteractionHandler] Couldn't delete reply."
            )
          );

        return;
      }

      const authorDB = await this.container.prisma.user.findUnique({
        where: {
          discordId: interaction.user.id,
        },
        select: {
          id: true,
          latestPromotionDate: true,
          latestPromotionRoleId: true,
          habboName: true,
        },
      });

      const nextSectorRoleKey = getJobSectorsById(nextRole.id);

      const nextSectorRole =
        nextSectorRoleKey &&
        (await guild.roles.fetch(
          ENVIRONMENT.SECTORS_ROLES[nextSectorRoleKey].id
        ));

      if (targetDB && nextSectorRole)
        await this.container.prisma.user.update({
          where: {
            habboId: onlyHabbo.uniqueId,
          },
          data: {
            latestPromotionDate: new Date(),
            latestPromotionRoleId: nextSectorRole.id,
            latestPromotionJobId: nextRole.id,
          },
        });

      const notificationChannel = await this.container.client.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_PROMOTIONS
      );

      if (
        !(notificationChannel instanceof TextChannel) &&
        !(notificationChannel instanceof DMChannel) &&
        !(notificationChannel instanceof NewsChannel) &&
        !(notificationChannel instanceof ThreadChannel)
      ) {
        throw new Error("Can’t send message to a non-text channel");
      }

      const authorResult = await Result.fromAsync(
        this.container.utilities.habbo.inferTargetGuildMember(
          `@${interaction.user.tag}`,
          true
        )
      );

      let habboName: string | undefined = undefined;

      if (authorResult) {
        const { habbo: authorHabbo } = authorResult.unwrapOr({
          member: undefined,
          habbo: undefined,
        });

        habboName = authorHabbo?.name ?? "N/A";
      }

      if (notificationChannel?.isTextBased()) {
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `### Promoção de ${onlyHabbo?.name ?? targetDB.habboName}\n\n`
              )
              .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL(),
              })
              .addFields([
                {
                  name: "👤 Promotor ",
                  value: `${habboName ?? authorDB?.habboName}`,
                },
                {
                  name: "🗓️ Promovido Em",
                  value: time(new Date(), "F"),
                  inline: true,
                },
                {
                  name: "📅 Última Promoção",
                  value: targetDB?.latestPromotionDate
                    ? time(targetDB.latestPromotionDate, "F")
                    : "N/A",
                  inline: true,
                },
                {
                  name: "📝 Cargo Anterior",
                  value: currentJob.toString(),
                  inline: false,
                },
                {
                  name: "📗 Cargo Promovido",
                  value: targetJobRole.toString(),
                },
                {
                  name: "🗒️ Observação",
                  value:
                    result.additional.length > 0
                      ? result.additional
                      : "Nenhuma observação foi adicionada.",
                },
              ])
              .setColor(EmbedColors.Success)
              .setThumbnail(
                `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
              ),
          ],
        });

        await interactionFromModal.editReply({
          content: "✅ Operação concluída.",
          embeds: [],
          components: [],
        });
      }

      return;
      // END USER WITHOUT DISCORD
    }

    const inferredTargetResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(result.target)
    );

    if (inferredTargetResult.isErr()) {
      await interactionFromModal.editReply({
        content: "||P93N|| Houve um erro inesperado, contate o desenvolvedor.",
      });

      this.container.logger.error(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not in the server.`,
        { error: inferredTargetResult.unwrapErr() }
      );

      return;
    }

    const { member: targetMember, habbo: targetHabbo } =
      inferredTargetResult.unwrapOr({ member: undefined, habbo: undefined });

    if (!targetHabbo) {
      await interactionFromModal.editReply({
        content:
          "Não foi possivel encontrar o usuário no Habbo, verifique se a conta que quer promover está como pública.",
      });

      return;
    }

    if (!targetMember) {
      const isHabboTarget = result.target.startsWith("@");

      this.container.logger.info(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not in the server.`,
        { isHabboTarget }
      );

      await interactionFromModal.editReply({
        content: !isHabboTarget
          ? "||P108N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o ID do Discord, ele(a) deve estar no servidor)."
          : "||P107N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o nickname do Habbo, ele(a) deve estar registrado(a) com `vincular`).",
      });

      return;
    }

    const currentTargetJob = this.#inferHighestJobRole(targetMember.roles);

    this.container.logger.info(
      `[PromotionInteractionHandler#run] CurrentTargetJob #inferHighestJobRole: ${currentTargetJob}`
    );

    if (!currentTargetJob) {
      await interactionFromModal.editReply({
        content:
          "||WP120|| Não foi possível encontrar o atual cargo do usuário, você tem certeza que ele(a) possui um cargo hierárquico? Se não, contate o desenvolvedor.",
      });

      this.container.logger.info(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they don't have a job.`
      );

      return;
    }

    // Next Job
    // Next Job

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    // const jobRolesChoices = await Promise.all(
    // 	values(ENVIRONMENT.JOBS_ROLES).map(
    // 		async (value) =>
    // 			value.id &&
    // 			(guild.roles.cache.get(value.id) ??
    // 				(await guild.roles.fetch(value.id))),
    // 	),
    // );

    // const [nextTargetJobId] =
    // 	await this.container.utilities.inquirer.awaitSelectMenu(
    // 		interactionFromModal,
    // 		{
    // 			choices: [
    // 				{
    // 					id: "AUTO",
    // 					label: "Automático",
    // 					description: "Infere o próximo cargo na lista.",
    // 					emoji: "🤖",
    // 				},
    // 				...jobRolesChoices.filter(Boolean).map((role) => ({
    // 					id: role.id,
    // 					label: role.name,
    // 				})),
    // 			],
    // 			placeholder: "Selecionar",
    // 			question: "Selecione o cargo que deseja promover.",
    // 		},
    // 	);

    // Authorized
    // Authorized

    // Infer Roles
    // Infer Roles

    const nextTargetJob = this.#inferNextJobRole(
      targetMember.roles,
      currentTargetJob
    );

    this.container.logger.info(
      `[PromotionInteractionHandler#run]
      nextTargetJob: ${nextTargetJob}, \n
      nextTargetJobId: ${nextTargetJob?.id}, \n
    `
    );

    if (!nextTargetJob) {
      await interactionFromModal.editReply({
        content:
          "||P132N|| O usuário selecionado já está no ápice possível em que você pode promover. Se não, contate o desenvolvedor.",
      });

      this.container.logger.info(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`,
        { previousTargetJobId: currentTargetJob.id }
      );

      return;
    }

    const targetJobRole =
      nextTargetJob.id &&
      (await targetMember.guild.roles.fetch(nextTargetJob.id));

    if (!targetJobRole) {
      this.container.logger.error(
        "[PromotionInteractionHandler#run] targetJobRole Error"
      );

      return;
    }

    const [isPromotionPossible, registrationType] =
      await this.#isPromotionPossible(
        interactionFromModal,
        targetMember.id,
        nextTargetJob.id,
        currentTargetJob.id
      );

    this.container.logger.info(
      `[PromotionInteractionHandler#run] isPromotionPossible: ${isPromotionPossible}`
    );

    if (!isPromotionPossible) {
      const author = await guild.members.fetch(interaction.user.id);

      const authorJobRoleId =
        this.container.utilities.discord.inferHighestJobRole(
          author.roles.cache.map((r) => r.id)
        );

      const authorJobRole =
        authorJobRoleId && (await author.guild.roles.fetch(authorJobRoleId));

      await interactionFromModal.editReply({
        content:
          // "Você não pode promover este usuário, pois ele já possui um cargo de maior autoridade permitido para realizar promoções.",
          `Seu cargo de ${authorJobRole} não tem permissão para promover alguém para o cargo de ${targetJobRole}`,
      });

      this.container.logger.info(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`
      );

      return;
    }

    // Check Cooldown
    // Check Cooldown

    const existingUser = await this.container.prisma.user.findUnique({
      where: {
        discordId: targetMember.user.id,
      },
      select: {
        id: true,
        discordId: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
      },
    });

    const authorDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: interaction.user.id,
      },
      select: {
        id: true,
        latestPromotionDate: true,
        latestPromotionRoleId: true,
        habboName: true,
      },
    });

    const authorizedHigherRoleId = this.#isTargetRoleInferior(
      "SUPERVISOR",
      nextTargetJob.id
    );

    // this.container.logger.info(
    // 	`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`,
    // 	{ authorizedHigherRoleId },
    // );

    if (!existingUser && !authorizedHigherRoleId) {
      await interactionFromModal.editReply({
        content:
          "||WP157|| Usuário não encontrado na base de dados, use `vincular`.",
      });

      return;
    }

    const latestPromotionDate =
      existingUser?.latestPromotionDate &&
      new Date(existingUser?.latestPromotionDate);

    const minDaysProm = find(
      values(ENVIRONMENT.JOBS_ROLES),
      (x) => x.id === currentTargetJob.id
    )?.minDaysProm;

    if (latestPromotionDate && minDaysProm) {
      const daysSinceLastPromotion = Math.floor(
        (new Date().getTime() - latestPromotionDate.getTime()) /
          (1000 * 3600 * 24)
      );

      const shouldPromote = daysSinceLastPromotion >= minDaysProm;

      if (!shouldPromote) {
        await interactionFromModal.editReply({
          content: `🕝 O usuário tem que aguardar pelo menos ${
            minDaysProm - daysSinceLastPromotion
          } dia para poder promover de cargo.`,
        });

        return;
      }
    }

    // Confirmation
    // Confirmation

    const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
      interactionFromModal,
      {
        choices: [
          {
            id: "true",
            label: "Sim",
            style: ButtonStyle.Success,
          },
          {
            id: "false",
            label: "Não",
            style: ButtonStyle.Danger,
          },
        ] as ButtonValue[],
        question: {
          embeds: [
            new EmbedBuilder()
              .setTitle("Promover")
              .setDescription(
                `Promover <@${targetMember.user.id}> para ${targetJobRole}?`
              )
              .setThumbnail(
                `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
              )
              .setColor(EmbedColors.Default),
          ],
        },
      }
    );

    if (isConfirmed.result === "false") {
      await interactionFromModal
        .deleteReply()
        .catch(() =>
          this.container.logger.error(
            "[PromotionInteractionHandler] Couldn't delete reply."
          )
        );

      return;
    }

    // Promotion
    // Promotion

    const nextSectorRoleKey = getJobSectorsById(nextTargetJob.id);
    const previousSectorRoleKey = getJobSectorsById(currentTargetJob.id);

    const nextSectorRole =
      nextSectorRoleKey &&
      (await guild.roles.fetch(
        ENVIRONMENT.SECTORS_ROLES[nextSectorRoleKey].id
      ));

    const previousSectorRole =
      previousSectorRoleKey &&
      (await guild.roles.fetch(
        ENVIRONMENT.SECTORS_ROLES[previousSectorRoleKey].id
      ));

    await Promise.all([
      await targetMember.roles.remove(currentTargetJob.id),
      previousSectorRole?.id !== nextSectorRole?.id &&
        previousSectorRole &&
        (await guild.members.removeRole({
          user: targetMember.id,
          role: previousSectorRole,
        })),

      await targetMember.roles.add(nextTargetJob.id),
      nextSectorRole &&
        (await guild.members.addRole({
          user: targetMember.id,
          role: nextSectorRole,
        })),
    ]);

    this.container.logger.info(
      `[PromotionInteractionHandler#run]
        existingUser: ${existingUser}, \n
        nextSectorRoleName: ${nextSectorRole?.name}, \n
        nextSectorRoleId: ${nextSectorRole?.id}, \n
        nextTargetJobName: ${nextTargetJob}, \n
        nextTargetJobId: ${nextTargetJob.id}`
    );

    if (existingUser && nextSectorRole) {
      await this.container.prisma.user.update({
        where: {
          id: existingUser.id,
        },

        data: {
          latestPromotionDate: new Date(),
          latestPromotionRoleId: nextSectorRole.id,
          latestPromotionJobId: nextTargetJob.id,
        },
      });

      if (targetDB?.latestPromotionJobId && targetDB.latestPromotionRoleId) {
        const oldRoles: string[] = [
          targetDB.latestPromotionJobId,
          targetDB.latestPromotionRoleId,
        ];

        const updatedUserDB: User =
          await this.container.prisma.user.findUniqueOrThrow({
            where: {
              id: existingUser.id,
            },
          });

        await this.updateDiscordLogRole("PROMOTION", updatedUserDB, oldRoles);
      }
    }

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_PROMOTIONS
    );

    const authorResult =
      registrationType === "REGISTERED" &&
      (await Result.fromAsync(
        this.container.utilities.habbo.inferTargetGuildMember(
          `@${interaction.user.tag}`,
          true
        )
      ));

    let habboName: string | undefined = undefined;

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboName = authorHabbo?.name ?? "N/A";
    }

    if (
      !(notificationChannel instanceof TextChannel) &&
      !(notificationChannel instanceof DMChannel) &&
      !(notificationChannel instanceof NewsChannel) &&
      !(notificationChannel instanceof ThreadChannel)
    ) {
      throw new Error("Can’t send message to a non-text channel");
    }

    if (notificationChannel?.isTextBased()) {
      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `### Promoção de ${
                targetHabbo?.name ?? `@${targetMember.user.tag}`
              }\n\n`
            )
            .setAuthor({
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .addFields([
              {
                name: "👤 Promotor ",
                value: `${habboName ?? authorDB?.habboName}`,
              },
              {
                name: "🗓️ Promovido Em",
                value: time(new Date(), "F"),
                inline: true,
              },
              {
                name: "📅 Última Promoção",
                value: existingUser?.latestPromotionDate
                  ? time(existingUser.latestPromotionDate, "F")
                  : "N/A",
                inline: true,
              },
              {
                name: "📝 Cargo Anterior",
                value: currentTargetJob.toString(),
                inline: false,
              },
              {
                name: "📗 Cargo Promovido",
                value: targetJobRole.toString(),
              },
              {
                name: "🗒️ Observação",
                value:
                  result.additional.length > 0
                    ? result.additional
                    : "Nenhuma observação foi adicionada.",
              },
            ])
            .setColor(EmbedColors.Success)
            .setThumbnail(
              `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
            ),
        ],
      });
    }

    await interactionFromModal.editReply({
      content: "✅ Operação concluída.",
      embeds: [],
      components: [],
    });
  }

  async updateDiscordLogRole(
    embedType: "PROMOTION" | "DOWNGRADE" | "FIRE" | "HIRE" | "LEAVE",
    updatedUserDB: User,
    oldUser?: string[]
  ) {
    const mainServerGuild = await container.client.guilds.fetch(
      ENVIRONMENT.GUILD_ID
    );

    const logGuild = await container.client.guilds.fetch(
      ENVIRONMENT.LOG_GUILD_ID
    );

    const notificationChannel = await logGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.WELCOME_LOG
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    let member: GuildMember | null = await logGuild.members
      .fetch(updatedUserDB.discordId)
      .catch((error) => {
        container.logger.warn(
          `          User ${updatedUserDB.discordId} not found in log server: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        return null;
      });

    if (!member) return;

    if (!updatedUserDB?.latestPromotionJobId) return;
    if (!updatedUserDB?.latestPromotionRoleId) return;

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(updatedUserDB.habboName)
    ).unwrapOr(undefined);

    if (!onlyHabbo?.name) {
      console.warn(
        "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público."
      );
    }

    let roleCargo: Role | null = null;
    let oldRoleCargo: Role | null = null;

    const previousRoles: string[] = oldUser ?? [];
    if (previousRoles) {
      for (const prevRole of previousRoles) {
        const oldRole =
          mainServerGuild.roles.cache.get(prevRole) ??
          (await mainServerGuild.roles.fetch(prevRole).catch(() => null));

        if (oldRole) {
          const roleToRemove = logGuild.roles.cache.find(
            (role) => role.name === oldRole.name
          );

          if (roleToRemove) {
            try {
              await member.roles.remove(roleToRemove);
              oldRoleCargo = roleToRemove;
            } catch (err) {
              container.logger.warn(
                `Error removing role ${roleToRemove.id}:`,
                err
              );
            }
          }
        }
      }
    }

    if (embedType !== "FIRE" && embedType !== "LEAVE") {
      for (const roleId of [
        updatedUserDB?.latestPromotionJobId,
        updatedUserDB?.latestPromotionRoleId,
      ]) {
        const rolesMainServer =
          mainServerGuild.roles.cache.get(roleId) ??
          (await mainServerGuild.roles.fetch(roleId).catch(() => null));
        if (!rolesMainServer) {
          container.logger.warn(`Role ${roleId} not found on log server.`);
          continue;
        }

        const rolesToAdd = logGuild.roles.cache.filter(
          (role) => role.name === rolesMainServer.name
        );

        if (!rolesToAdd.size) {
          container.logger.warn(
            `Not found role "${rolesMainServer.name}" on log server.`
          );
          continue;
        }

        for (const role of rolesToAdd.values()) {
          try {
            await member.roles.add(role);
            if (!roleCargo) roleCargo = role;
          } catch (err) {
            container.logger.error(`Failed to add role ${role.id}:`, err);
          }
        }
      }
    }

    switch (embedType) {
      case "PROMOTION":
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Atualização de Cargo de ${updatedUserDB.habboName} 📝`)
              .addFields([
                {
                  name: "Ação:",
                  value: `Promoção 📈`,
                },
                {
                  name: "💼 Cargo Anterior",
                  value: `${
                    oldRoleCargo ? oldRoleCargo : "Sem cargo vinculado"
                  }`,
                  inline: true,
                },
                {
                  name: "📈 Cargo Promovido",
                  value: `${roleCargo}`,
                  inline: true,
                },
                {
                  name: "🪪 Discord:",
                  value: `<@${updatedUserDB.discordId}>`,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.Success)
              .setThumbnail(
                onlyHabbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                  : null
              ),
          ],
        });
        break;
      case "DOWNGRADE":
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Atualização de Cargo de ${updatedUserDB.habboName} 📝`)
              .addFields([
                {
                  name: "Ação:",
                  value: `Rebaixamento 📉`,
                },
                {
                  name: "💼 Cargo Anterior",
                  value: `${oldRoleCargo}`,
                  inline: true,
                },
                {
                  name: "📉 Cargo Rebaixado",
                  value: `${roleCargo}`,
                  inline: true,
                },
                {
                  name: "🪪 Discord:",
                  value: `<@${updatedUserDB.discordId}>`,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                onlyHabbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                  : null
              ),
          ],
        });
        break;
      case "HIRE":
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Atualização de Cargo de ${updatedUserDB.habboName} 📝`)
              .addFields([
                {
                  name: "Ação:",
                  value: `Contratação 📇`,
                },
                {
                  name: "💼 Cargo Atual",
                  value: `${roleCargo ? roleCargo : "Sem cargo vinculado"}`,
                  inline: true,
                },
                {
                  name: "🪪 Discord:",
                  value: `<@${updatedUserDB.discordId}>`,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.Hire)
              .setThumbnail(
                onlyHabbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                  : null
              ),
          ],
        });
        break;
      case "FIRE":
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Remoção de Cargo de ${updatedUserDB.habboName} 📝`)
              .addFields([
                {
                  name: "Ação:",
                  value: `Demissão ⛔`,
                },
                {
                  name: "💼 Cargo Anterior",
                  value: `${oldRoleCargo}`,
                  inline: true,
                },
                {
                  name: "🪪 Discord:",
                  value: `<@${updatedUserDB.discordId}>`,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                onlyHabbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                  : null
              ),
          ],
        });
        break;
      case "LEAVE":
        await notificationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Remoção de Cargo de ${updatedUserDB.habboName} 📝`)
              .addFields([
                {
                  name: "Ação:",
                  value: `Saída do Discord Principal ⛔`,
                },
                {
                  name: "💼 Cargo Anterior",
                  value: `${
                    oldRoleCargo ? oldRoleCargo : "Sem cargo vinculado"
                  }`,
                  inline: true,
                },
                {
                  name: "🪪 Discord:",
                  value: `<@${updatedUserDB.discordId}>`,
                  inline: false,
                },
              ])
              .setColor(EmbedColors.LalaRed)
              .setThumbnail(
                onlyHabbo
                  ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
                  : null
              ),
          ],
        });
        break;
      default:
        break;
    }
  }

  // Private Methods
  // Private Methods

  async #isPromotionPossible(
    interaction: RepliableInteraction,
    user: Snowflake,
    selectedJob: Snowflake,
    currentTargetJob: Snowflake
  ): Promise<[boolean, "REGISTERED" | "UNREGISTERED"]> {
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

    const author = await guild.members.fetch(interaction.user.id);

    const updatedUserDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: user,
      },
      select: {
        latestPromotionDate: true,
        latestPromotionRoleId: true,
      },
    });

    if (!updatedUserDB) {
      this.container.logger.warn(
        `Promotion for ${user} is possible because the user is not registered.`
      );

      return [true, "REGISTERED"];
    }

    // const targetJobRole =
    // 	this.container.utilities.discord.inferHighestJobRole(
    // 		target.roles.cache.map((r) => r.id),
    // 	);

    const authorJobRole = this.container.utilities.discord.inferHighestJobRole(
      author.roles.cache.map((r) => r.id)
    );

    const targetJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
      (job) => job.id === currentTargetJob
    );

    const authorJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
      (job) => job.id === authorJobRole
    );

    this.container.logger.info(
      `[PromotionInteractionHandler#isPromotionPossible] \n
      targetJobSelected: ${selectedJob} \n
      targetJobIndex: ${targetJob?.index} \n
      authorJobRole: ${authorJobRole} \n
      authorJobPromoteIndex: ${authorJob?.promoteIndex} \n
      `
    );

    const hasEnoughHierarchy =
      (targetJob?.index ?? 0) <= (authorJob?.promoteIndex ?? -1) &&
      interaction.user.id !== user;

    const isNotSelfPromotion = interaction.user.id !== user;

    this.container.logger.info(
      `[PromotionInteractionHandler#isPromotionPossible] \n
        hasEnoughHierarchy: ${hasEnoughHierarchy} \n
        isNotSelfPromotion: ${isNotSelfPromotion}
        `
    );

    // const isAuthorizedUnregistered =
    // 	targetJob?.index ?? 0 <= MAX_PROMOTABLE_UNREGISTERED_ROLES;

    if (!targetJob?.index) {
      return [true, "UNREGISTERED"];
    }

    return [isNotSelfPromotion && hasEnoughHierarchy, "REGISTERED"];
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

  #inferNextJobRole(roles: GuildMemberRoleManager, currentRole: Role) {
    const currentRoleSearch = Object.values(ENVIRONMENT.JOBS_ROLES).find(
      (r) => r.id === currentRole.id
    );

    if (!currentRoleSearch) return null;
    if (!roles) return null;

    const nextRole = Object.values(ENVIRONMENT.JOBS_ROLES)
      .sort((a, b) => a.index - b.index)
      .find((role) => role.index > currentRoleSearch.index);

    this.container.logger.info(
      `[PromotionInteractionHandler#inferNextJobRole] \n
      currentRole: ${currentRole} \n
      currentRoleSearch: ${currentRoleSearch} \n
      nextRole: ${nextRole} \n
      `
    );

    return nextRole;
  }

  #isTargetRoleInferior(
    maxRole: keyof typeof ENVIRONMENT.JOBS_ROLES,
    targetRoleId: string
  ) {
    const jobsRoles = Object.values(ENVIRONMENT.JOBS_ROLES);

    const maxRoleIndex =
      jobsRoles[Object.keys(jobsRoles).findIndex((key) => key === maxRole)]
        ?.index;

    const targetRoleIndex =
      jobsRoles[Object.keys(jobsRoles).findIndex((key) => key === targetRoleId)]
        ?.index;

    return targetRoleIndex && targetRoleIndex < maxRoleIndex;
  }
}
