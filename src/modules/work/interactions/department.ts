import {
  ButtonInteraction,
  ButtonStyle,
  DMChannel,
  EmbedBuilder,
  ModalSubmitInteraction,
  NewsChannel,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  time,
} from "discord.js";

import {
  InteractionHandler,
  InteractionHandlerTypes,
  Result,
} from "@sapphire/framework";

import { schedule } from "node-cron";
import { z } from "zod";

import { RenewalPeriod } from "@prisma/client";
import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { values } from "remeda";
import { SelectMenuValue } from "$lib/utilities/inquirer";

const ActionData = z.object({
  action: z.enum(["SelfRequestReturn", "AdminRequestLeave"]),

  id: z
    .string()
    .refine((value) => value && /^[a-f\d]{24}$/i.test(value), {
      message: "Invalid ObjectId",
    })
    .optional(),
});

type ActionData = z.infer<typeof ActionData>;

const BASE_BUTTON_ID = "LCST::DepartmentInteractionHandler";
const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

export function encodeButtonId(data: ActionData) {
  return `${BASE_BUTTON_ID}/${JSON.stringify(data)}`;
}

let habboInteractionName: string | undefined = undefined;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DepartmentInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) {
      return this.none();
    }

    const { action, id } = ActionData.parse(
      JSON.parse(interaction.customId.split("/")[1])
    );

    let isAuthorized: boolean;

    if (action === "SelfRequestReturn") {
      isAuthorized = true;
    } else {
      const interactionTag = interaction.user.tag;
      if (!interaction.inGuild()) {
        this.container.logger.warn(
          `[DepartmentInteractionHandler#isAuthorized] ${interactionTag} tried to perform an action in a DM.`
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

      isAuthorized = this.container.utilities.discord.hasPermissionByRole({
        checkFor: "INICIAL",
        category: "SECTOR",
        roles,
      });
    }

    return isAuthorized ? this.some({ action, id }) : this.none();
  }

  public override async run(interaction: ButtonInteraction, data: ActionData) {
    // ----------------
    // --    SELF    --
    // ----------------

    if (data.action === "SelfRequestReturn") {
      const { interaction: interactionFromModal, result } =
        await this.container.utilities.inquirer.awaitModal<"target">(
          interaction,
          {
            title: "Retorno",
            listenInteraction: true,

            inputs: [
              new TextInputBuilder()
                .setCustomId("target")
                .setLabel("Retornado (Discord ou Habbo)")
                .setPlaceholder(
                  "Informe ID do Discord (@Nick) ou do Habbo (Nick)."
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ],
          }
        );

      const { member: targetMember } =
        await this.container.utilities.habbo.inferTargetGuildMember(
          result.target
        );

      if (!targetMember) {
        await interactionFromModal.editReply({
          content: "Não foi possível encontrar o usuário informado no Discord.",
        });

        return;
      }

      // Confirmation

      const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
        interactionFromModal,
        {
          choices: [
            {
              id: "true" as const,
              style: ButtonStyle.Success,
              label: "Sim",
            },
            {
              id: "false" as const,
              style: ButtonStyle.Danger,
              label: "Não",
            },
          ],
          question: {
            content: `Tem certeza que deseja retornar <@${targetMember.user.id}>?`,
          },
        }
      );

      if (isConfirmed.result === "false") {
        await interactionFromModal.editReply({
          content: "Operação cancelada.",
        });

        return;
      }

      return await this.#return(targetMember.user.id, interactionFromModal);
    }

    // ---------------
    // --   ADMIN   --
    // ---------------

    const { interaction: interactionFromModal, result } =
      await this.container.utilities.inquirer.awaitModal<"target" | "reason">(
        interaction,
        {
          title: "Aplicar Afastamento",
          listenInteraction: true,

          inputs: [
            new TextInputBuilder()
              .setCustomId("target")
              .setLabel("Afastado (Discord ou Habbo)")
              .setPlaceholder(
                "Informe ID do Discord (@Nick) ou do Habbo (Nick)."
              )
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Motivo")
              .setPlaceholder("Ex.: Motivo do afastamento")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ],
        }
      );

    const { member: targetMember, habbo: targetHabbo } =
      await this.container.utilities.habbo.inferTargetGuildMember(
        result.target
      );

    if (!targetMember) {
      await interactionFromModal.editReply({
        content: "Não foi possível encontrar o usuário informado.",
      });

      return;
    }

    // Confirmation

    const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
      interactionFromModal,
      {
        choices: [
          {
            id: "true" as const,
            style: ButtonStyle.Success,
            label: "Sim",
          },
          {
            id: "false" as const,
            style: ButtonStyle.Danger,
            label: "Não",
          },
        ],
        question: {
          content: `Tem certeza que deseja afastar <@${targetMember.user.id}>?`,
        },
      }
    );

    if (isConfirmed.result === "false") {
      await interactionFromModal.editReply({
        content: "Operação cancelada.",
      });

      return;
    }

    // Renewal Period

    const [renewalPeriod] =
      await this.container.utilities.inquirer.awaitSelectMenu(
        interactionFromModal,
        {
          placeholder: "Selecionar",
          question: "Por quanto tempo deseja afastar o usuário?",
          choices: [
            { id: "Cancel", label: "Cancelar", emoji: "❌" },
            { id: RenewalPeriod.Leave15Days, label: "15 Dias", emoji: "⏳" },
            { id: RenewalPeriod.Leave30Days, label: "30 Dias", emoji: "⏳" },
          ] as SelectMenuValue[],
        }
      );

    if (renewalPeriod === "Cancel") {
      await interactionFromModal.editReply({
        content: "Operação cancelada.",
      });

      return;
    }

    // Applies Demotion

    const guild = await this.container.client.guilds.fetch(
      ENVIRONMENT.GUILD_ID
    );

    const renewalRole = await guild.roles.fetch(
      renewalPeriod === RenewalPeriod.Leave15Days
        ? ENVIRONMENT.SYSTEMS_ROLES.AFASTADO15.id
        : ENVIRONMENT.SYSTEMS_ROLES.AFASTADO30.id
    );

    if (!renewalRole) {
      await interactionFromModal.editReply({
        content:
          "Não foi possível encontrar o cargo informado (15 dias ou 30 dias), contate o desenvolvedor.",
      });

      return;
    }

    await guild.members.addRole({
      user: targetMember,
      role: renewalRole,
    });

    await this.container.prisma.user
      .update({
        where: {
          discordId: targetMember.user.id,
        },
        data: {
          activeRenewal: renewalPeriod,
          activeRenewalStartedAt: new Date(),
        },
      })
      .catch((error) => {
        interaction?.editReply({
          content: `Não foi possível adicionar os dados de afastamento do usuário no banco de dados, tente novamente ou contate o Desenvolvedor. Erro: ||${error}||`,
          components: [],
          embeds: [],
        });

        return;
      });

    const targetDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: targetMember.user.id,
      },
    });

    this.container.logger.info(
      `[DepartmentInteractionHandler#run] Usuário ${targetDB.habboName} afastado por ${targetDB.activeRenewal}.`
    );

    if (!targetDB) {
      await interaction?.editReply({
        content:
          "Não consegui encontrar o usuário escolhido no banco de dados, contate o Desenvolvedor.",
        components: [],
        embeds: [],
      });

      return;
    }

    const dmChannel = targetMember.dmChannel || (await targetMember.createDM());

    const readableRenewalPeriod =
      renewalPeriod === "Leave15Days" ? "15 dias" : "30 dias";

    const renewalPeriodInMilliseconds =
      renewalPeriod === "Leave15Days"
        ? 15 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

    await interactionFromModal.editReply({
      content: `O usuário <@${targetMember.user.id}> foi afastado com sucesso!`,
      components: [],
    });

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_DEMOTION
    );

    const targetMemberJobRoleId =
      this.container.utilities.discord.inferHighestJobRole(
        targetMember.roles.cache.map((role) => role.id)
      );

    const targetMemberJobRole =
      targetMemberJobRoleId && (await guild.roles.fetch(targetMemberJobRoleId));

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

    const authorDB = await this.container.prisma.user.findUniqueOrThrow({
      where: {
        discordId: interaction?.user.id,
      },
      select: {
        habboName: true,
      },
    });

    if (notificationChannel?.isTextBased()) {
      if (
        !(notificationChannel instanceof TextChannel) &&
        !(notificationChannel instanceof DMChannel) &&
        !(notificationChannel instanceof NewsChannel) &&
        !(notificationChannel instanceof ThreadChannel)
      ) {
        throw new Error("Can’t send message to a non-text channel");
      }

      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.LalaRed)
            .setTitle(`Afastamento de ${targetDB.habboName} ⏳`)
            .setAuthor({
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setFields([
              {
                name: "👤 Autor",
                value: `${authorDB.habboName ?? habboInteractionName}`,
              },
              {
                name: "💼 Cargo",
                value: targetMemberJobRole?.toString() || "Sem cargo vinculado",
              },
              {
                name: "⏰ Tempo",
                value: readableRenewalPeriod,
              },
              {
                name: "🗓️ Data",
                value: `${time(new Date(), "D")} até ${time(
                  new Date(Date.now() + renewalPeriodInMilliseconds),
                  "D"
                )}`,
              },
              {
                name: "🗒️ Motivo",
                value: result.reason.length > 0 ? result.reason : "N/D",
              },
              {
                name: "🪪 Discord",
                value: `<@${targetMember.id}>`,
              },
            ])
            .setThumbnail(
              targetHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
                : null
            ),
        ],
      });

      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Info)
            .setTitle("Afastamento Temporário ⏳")
            .setDescription(
              `📅 Você foi afastado até ${time(
                new Date(Date.now() + renewalPeriodInMilliseconds),
                "f"
              )}.

              🔁 O retorno será automático ao final desse prazo, mas se desejar, você pode retornar manualmente antes do término. Dessa forma, os dias restantes poderão ser utilizados em um futuro afastamento, dentro das regras estabelecidas.
              Os afastamentos são processos formais para cargos a partir de Intendente, não sendo necessários para cargos inferiores.
              
              🚨 Em casos graves, como acidentes, internações ou situações que exijam um afastamento maior do que o permitido pelas regras, é necessário comunicar a Federação e apresentar as devidas comprovações para análise de uma possível exceção.
              
              ***#OrgulhoDeSerLacoste***`
            )
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setThumbnail(
              targetHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
                : null
            ),
        ],
        // components: [
        // 	new ActionRowBuilder<ButtonBuilder>().addComponents(
        // 		new ButtonBuilder()
        // 			.setStyle(ButtonStyle.Primary)
        // 			.setLabel("Retornar")
        // 			.setCustomId(
        // 				encodeButtonId({
        // 					action: "SelfRequestReturn",
        // 					id,
        // 				}),
        // 			),

        // 		new ButtonBuilder()
        // 			.setStyle(ButtonStyle.Primary)
        // 			.setLabel("Renovar")
        // 			.setDisabled(true)
        // 			.setCustomId(
        // 				encodeButtonId({
        // 					action: "SelfRequestRenew",
        // 					id,
        // 				}),
        // 			),
        // 	),
        // ],
      });
    }
  }

  public override onLoad() {
    /**
     * Schedules a cron job to run every 15 minutes.
     * @summary Checks for users who are away, notifying if necessary and returning if the renew period is over.
     */
    schedule("*/15 * * * *", async () => {
      // schedule("*/30 * * * * *", async () => {
      const users = await this.container.prisma.user.findMany({
        where: { activeRenewal: { not: null } },
      });

      for await (const user of users) {
        const hasPendingRenewal = await this.#hasPendingRenewal(user.id);

        if (hasPendingRenewal && user.activeRenewalStartedAt) {
          const startedRenew = user.activeRenewalStartedAt.getTime();
          const renewalPeriodMs =
            user.activeRenewal === "Leave15Days"
              ? 1000 * 60 * 60 * 24 * 15
              : 1000 * 60 * 60 * 24 * 30;

          const endedRenew = startedRenew + renewalPeriodMs;
          const now = Date.now();

          /* DEMOTE DESATIVADO */
          // if (renewalPeriod < new Date())
          //   return await this.#demote(user.discordId);

          /* if < 1 day send dm */
          if (
            now >= endedRenew - 1000 * 60 * 60 * 24 &&
            now < endedRenew &&
            !user.activeRenewalMessageId
          ) {
            const targetMember = await this.container.client.users.fetch(
              user.discordId
            );

            if (!targetMember) continue;

            const dmChannel =
              targetMember.dmChannel || (await targetMember.createDM());

            const reminderMessage = await dmChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(EmbedColors.Alert)
                  .setTitle("Afastamento Temporário está acabando! ⏰")
                  .setDescription(
                    `
                      ⚠️  Seu afastamento está perto de expirar e você será retornado automaticamente nas próximas 24 horas.
  
                      📌  Lembre-se que é possível retornar antes do término do prazo ou caso necessite de mais tempo, solicite um novo afastamento seguindo as regras.
                      
                      ***#OrgulhoDeSerLacoste***`
                  ),
              ],
            });

            await this.container.prisma.user
              .update({
                where: { id: user.id },
                data: { activeRenewalMessageId: reminderMessage.id },
              })
              .catch((error) => {
                this.container.logger.warn(
                  `Não foi possível adicionar os dados de mensagem do afastamento do usuário no banco de dados, tente novamente ou contate o Desenvolvedor. Erro: ||${error}||`
                );
              });
          }

          /* if on time send dm and return */
          if (endedRenew <= now) {
            const targetMember = await this.container.client.users.fetch(
              user.discordId
            );
            if (!targetMember || !user.activeRenewalMessageId) continue;

            this.container.logger.info(
              `[DepartmentInteractionHandler#onLoad] Iniciando retorno de ${user.habboName} com #autoReturn.`
            );

            await this.#autoReturn(user.discordId);

            await targetMember.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(EmbedColors.Success)
                  .setTitle("Afastamento Temporário acabou! ✅")
                  .setDescription(
                    `
                      Você retornou às suas atividades. 🔄 

                      O prazo do seu afastamento foi encerrado (automaticamente). Caso ainda necessite de mais tempo, solicite um novo afastamento conforme as regras.
  
                      📌  Lembre-se:

                      📍 [3.1.2.] Cargos acima de Intendente+ devem manter 5 presenças em sede dentro de 15 dias, caso não esteja afastado.
                      📍 [3.2.2.] Dentro de 6 meses você pode se afastar 60 dias.

                      Estas regras podem sofrer mudanças e estarem desatualizadas, se mantenha atualizado nos nossos Scripts e Condutas.
                      
                      ***#OrgulhoDeSerLacoste***`
                  ),
              ],
              reply: {
                failIfNotExists: false,
                messageReference: user.activeRenewalMessageId,
              },
            });
          }
        }
      }
    });
  }

  // Private Methods
  // Private Methods
  // Private Methods

  /* Checks if a user has a pending renewal by their Discord ID. */
  async #hasPendingRenewal(id: string) {
    const renewal = await this.container.prisma.user.findUnique({
      where: { id: id, activeRenewal: { not: null } },
    });

    return !!renewal;
  }

  /* Demotes a user to a lower rank by their Discord ID. DESATIVADO */
  // async #demote(id: string, interaction?: ButtonInteraction) {
  //   const user = await this.container.prisma.user.findUnique({
  //     where: { discordId: id },
  //   });

  //   if (!user) {
  //     await interaction?.reply({
  //       content: "[||E831||] Usuário não encontrado.",
  //       ephemeral: true,
  //     });

  //     return;
  //   }

  //   const member = await this.container.client.guilds
  //     .fetch(ENVIRONMENT.GUILD_ID)
  //     .then((guild) => guild.members.fetch(id));

  //   const currentJobId = this.container.utilities.discord.inferHighestJobRole(
  //     member.roles.cache.map((r) => r.id)
  //   );

  //   const currentJob =
  //     currentJobId && (await member.guild.roles.fetch(currentJobId));

  //   if (!currentJob) {
  //     await interaction?.reply({
  //       content: "[||E412||] Você não está em um setor.",
  //       ephemeral: true,
  //     });

  //     return;
  //   }

  //   const previousJobId = this.#inferPreviousJobRole(
  //     member.roles.cache.map((x) => x.id),
  //     currentJob
  //   );

  //   const previousJob =
  //     previousJobId && (await member.guild.roles.fetch(previousJobId));

  //   // if (!previousJob) {
  //   // 	await interaction?.reply({
  //   // 		content:
  //   // 			"[||E812||] O usuário informado não tem um cargo anterior/antecedente, ele está no primeiro cargo da hierarquia, talvez você queira demiti-lo?",
  //   // 		ephemeral: true,
  //   // 	});

  //   // 	return;
  //   // }

  //   if (currentJobId) {
  //     const sectorRoleKey = getJobSectorsById(currentJobId);

  //     const sectorRole =
  //       sectorRoleKey &&
  //       (await member.guild.roles.fetch(
  //         ENVIRONMENT.SECTORS_ROLES[sectorRoleKey].id
  //       ));

  //     if (sectorRole)
  //       await member.guild.members.removeRole({
  //         user: member.id,
  //         role: sectorRole,
  //       });
  //   }

  //   if (previousJob) {
  //     await member.roles.add(previousJob);

  //     const newSectorRoleKey = getJobSectorsById(previousJob.id);

  //     const newSectorRole =
  //       newSectorRoleKey &&
  //       (await member.guild.roles.fetch(
  //         ENVIRONMENT.SECTORS_ROLES[newSectorRoleKey].id
  //       ));

  //     if (newSectorRole)
  //       await member.guild.members.addRole({
  //         user: member.id,
  //         role: newSectorRole,
  //       });
  //   }

  //   await member.roles.remove(currentJob);

  //   await this.container.prisma.user.update({
  //     where: {
  //       discordId: id,
  //     },
  //     data: {
  //       latestPromotionDate: new Date(),
  //       latestPromotionRoleId: currentJob.id,
  //     },
  //   });
  // }

  /* Automatic Return */
  async #autoReturn(id: string) {
    const user = await this.container.prisma.user.findUniqueOrThrow({
      where: { discordId: id },
    });

    const member = await this.container.client.guilds
      .fetch(ENVIRONMENT.GUILD_ID)
      .then((guild) => guild.members.fetch(id));

    for await (const role of values(ENVIRONMENT.SYSTEMS_ROLES)) {
      await member.roles.remove(role.id).catch(() => {
        this.container.logger.warn(
          `[Utilities/DiscordUtility] Could not remove role ${role.id} from user ${member.id}.`
        );

        return;
      });
    }

    await this.container.prisma.user
      .update({
        where: {
          discordId: id,
        },
        data: {
          activeRenewal: null,
          activeRenewalMessageId: null,
          activeRenewalStartedAt: null,
        },
      })
      .catch((error) => {
        this.container.logger.warn(
          `Could not update activeRenewal's data from user ${member.id} on database.`,
          error
        );

        return;
      });

    this.container.logger.info(
      `[DepartmentInteractionHandler#autoReturn] Usuário ${user.habboName} afastado foi retornado automaticamente.`
    );

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_RETURN
    );

    if (notificationChannel?.isTextBased()) {
      if (
        !(notificationChannel instanceof TextChannel) &&
        !(notificationChannel instanceof DMChannel) &&
        !(notificationChannel instanceof NewsChannel) &&
        !(notificationChannel instanceof ThreadChannel)
      ) {
        throw new Error("Can’t send message to a non-text channel");
      }

      const { member: targetMember, habbo: targetHabbo } =
        await this.container.utilities.habbo.inferTargetGuildMember(
          user.habboId
        );

      const targetMemberJobRoleId =
        targetMember &&
        this.container.utilities.discord.inferHighestJobRole(
          targetMember.roles.cache.map((role) => role.id)
        );

      const targetMemberJobRole =
        targetMemberJobRoleId &&
        (await targetMember.guild.roles.fetch(targetMemberJobRoleId));

      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.LalaRed)
            .setTitle("Retorno Automatizado 🔄 🤖")
            .setThumbnail(
              targetHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
                : null
            )
            .setFields([
              {
                name: "👤 Autor",
                value: "*Automatizado por Lala* 🤖",
              },
              {
                name: "🪪 Usuário",
                value: `${user.habboName ?? targetHabbo?.name ?? "N/D"}${
                  targetMember ? ` // ${targetMember.toString()}` : ""
                }`,
              },
              {
                name: "💼 Cargo",
                value: targetMemberJobRole
                  ? targetMemberJobRole.toString()
                  : "Sem cargo vinculado",
              },
              {
                name: "🗓️ Data",
                value: time(new Date(), "D"),
              },
            ]),
        ],
      });
    }
  }

  /* Manual Return */
  async #return(id: string, interaction?: ModalSubmitInteraction) {
    const user = await this.container.prisma.user.findUnique({
      where: { discordId: id },
    });

    if (!user) {
      await interaction?.editReply({
        content: "[||E831||] Usuário não encontrado.",
      });

      return;
    }

    const member = await this.container.client.guilds
      .fetch(ENVIRONMENT.GUILD_ID)
      .then((guild) => guild.members.fetch(id));

    for await (const role of values(ENVIRONMENT.SYSTEMS_ROLES)) {
      await member.roles.remove(role.id).catch(() => {
        this.container.logger.warn(
          `[Utilities/DiscordUtility] Could not remove role ${role.id} from user ${member.id}.`
        );
      });
    }

    await this.container.prisma.user
      .update({
        where: {
          discordId: id,
        },
        data: {
          activeRenewal: null,
          activeRenewalMessageId: null,
          activeRenewalStartedAt: null,
        },
      })
      .catch((error) => {
        interaction?.editReply({
          content: `Não foi possível remover os dados do afastamento do usuário no banco de dados, tente novamente ou contate o Desenvolvedor. Erro: ||${error}||`,
          components: [],
          embeds: [],
        });

        return;
      });

    await interaction?.editReply({
      content: "Usuário retornado.",
      components: [],
      embeds: [],
    });

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_RETURN
    );

    if (notificationChannel?.isTextBased()) {
      if (
        !(notificationChannel instanceof TextChannel) &&
        !(notificationChannel instanceof DMChannel) &&
        !(notificationChannel instanceof NewsChannel) &&
        !(notificationChannel instanceof ThreadChannel)
      ) {
        throw new Error("Can’t send message to a non-text channel");
      }

      if (!interaction) {
        this.container.logger.warn(
          "[Utilities/DiscordUtility] Interation error."
        );

        return;
      }

      const authorDB = await this.container.prisma.user.findUnique({
        where: {
          discordId: interaction?.user.id,
        },
        select: {
          habboName: true,
        },
      });

      if (!authorDB) {
        await interaction?.editReply({
          content:
            "Não consegui encontrar o autor da requisição, contate o Desenvolvedor.",
          components: [],
          embeds: [],
        });

        return;
      }

      const { member: targetMember, habbo: targetHabbo } =
        await this.container.utilities.habbo.inferTargetGuildMember(
          user.habboId
        );

      const targetMemberJobRoleId =
        targetMember &&
        this.container.utilities.discord.inferHighestJobRole(
          targetMember.roles.cache.map((role) => role.id)
        );

      const targetMemberJobRole =
        targetMemberJobRoleId &&
        (await targetMember.guild.roles.fetch(targetMemberJobRoleId));

      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.LalaRed)
            .setTitle("Retorno Manual 🔄")
            .setFooter({
              text: targetHabbo?.name ?? targetMember?.user.tag ?? "N/D",
            })
            .setThumbnail(
              targetHabbo
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
                : null
            )
            .setFields([
              {
                name: "👤 Autor",
                value: authorDB.habboName,
              },
              {
                name: "🪪 Usuário",
                value: `${
                  targetHabbo?.name ?? targetMember?.user.tag ?? "N/D"
                }${targetMember ? ` // ${targetMember.toString()}` : ""}`,
              },
              {
                name: "💼 Cargo",
                value: targetMemberJobRole
                  ? targetMemberJobRole.toString()
                  : "N/D",
              },
              {
                name: "🗓️ Data",
                value: time(new Date(), "D"),
              },
            ]),
        ],
      });
    }
  }

  /* DESATIVADO */
  // #inferPreviousJobRole(roles: string[], currentRole: Role) {
  //   const currentRoleIndex =
  //     Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === currentRole.id)
  //       ?.index ?? 0;

  //   if (!currentRoleIndex) return null;

  //   const nextRole = Object.values(ENVIRONMENT.JOBS_ROLES)
  //     .sort((a, b) => a.index - b.index)
  //     .find((role) => role.index < currentRoleIndex);

  //   return nextRole ? roles.find((r) => r === nextRole.id) : null;
  // }
}
