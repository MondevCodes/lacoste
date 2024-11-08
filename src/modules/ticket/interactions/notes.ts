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
  type ButtonInteraction,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

export type Action = "Request" | "Approve" | "Reject";

export const BASE_BUTTON_ID = "LCST::NotesInteractionHandler";
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
    .setLabel("Anotado")
    .setPlaceholder("Informe o Habbo (Nick).")
    .setStyle(TextInputStyle.Short)
    .setCustomId("Target")
    .setRequired(true),

  Content: new TextInputBuilder()
    .setStyle(TextInputStyle.Paragraph)
    .setLabel("Descrição da Anotação")
    .setPlaceholder("Ex.: Tarefa feita no dia 29/09/2022")
    .setCustomId("Content")
    .setRequired(true),
} satisfies Record<string, TextInputBuilder | "GENERATED">;

const MODAL_INPUTS = Object.values(MODAL_INPUTS_OBJ);
type ModalInput = keyof typeof MODAL_INPUTS_OBJ;

let habboTargetStorage: string | undefined;
let habboInteractionName: string | undefined = undefined;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class NotesInteractionHandler extends InteractionHandler {
  async #isAuthorized(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) {
      this.container.logger.warn(
        `[NotesInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
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
        `[NotesInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
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
            title: "Anotação",
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

        const approvalChannel = await cachedGuild.channels.fetch(
          ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST
        );

        if (!approvalChannel?.isTextBased()) {
          throw new Error("Can't send message to non-text channel.");
        }

        habboTargetStorage = targetDBOnlyHabbo.habboName;

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

        const approvalEmbed = new EmbedBuilder()
          .setTitle(
            `Solicitação de Anotação para ${
              targetDBOnlyHabbo.habboName ?? onlyHabbo?.name
            }`
          )
          .setColor(EmbedColors.Default)
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .addFields([
            {
              name: "👤 Autor",
              value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
            },
            {
              name: "📗 Cargo do Colaborador",
              value: `${currentJob}`,
            },
            {
              name: "🗒️ Anotação",
              value: result.Content,
            },
          ])
          .setThumbnail(
            onlyHabbo
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}`
              : null
          );

        await approvalChannel.send({
          embeds: [approvalEmbed],
          components: [this.#APPROVAL_ROW],
          content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
        });

        await modalInteraction.editReply({
          content: "Solicitação enviada.",
        });

        return;
        // END WITHOUT DISCORD
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

      const targetUserId = await this.container.prisma.user.findUnique({
        where: { discordId: targetMember.id },
        select: { id: true, discordId: true, habboName: true },
      });

      if (!targetUserId) {
        await modalInteraction.reply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          ephemeral: true,
        });

        return;
      }

      const targetUser = await cachedGuild.members.fetch(
        targetUserId.discordId
      );

      if (!targetUser) {
        await modalInteraction.reply({
          content:
            "Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
          ephemeral: true,
        });
      }

      const approvalChannel = await cachedGuild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST
      );

      if (!approvalChannel?.isTextBased()) {
        throw new Error("Can't send message to non-text channel.");
      }

      const highestJobRoleId =
        this.container.utilities.discord.inferHighestJobRole(
          targetUser.roles.cache.map((r) => r.id)
        );

      habboTargetStorage = targetUserId.habboName;

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

      const approvalEmbed = new EmbedBuilder()
        .setTitle(`Solicitação de Anotação para ${targetUserId.habboName}`)
        .setColor(EmbedColors.Default)
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .addFields([
          {
            name: "👤 Autor",
            value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
          },
          {
            name: "📗 Cargo do Colaborador",
            value: highestJobRoleId
              ? `${(await targetMember.guild.roles.fetch(highestJobRoleId))}`
              : "N/A"
          },
          {
            name: "🗒️ Anotação",
            value: result.Content,
          },
        ])
        .setThumbnail(
          targetHabbo
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`
            : null
        );

      await approvalChannel.send({
        embeds: [approvalEmbed],
        components: [this.#APPROVAL_ROW],
        content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
      });

      await modalInteraction.editReply({
        content: "Solicitação enviada.",
      });

      return;
    }

    // ---------------------
    // -  Handle Approval  -
    // ---------------------

    if (action === "Reject") {
      await interaction.message.delete();

      return;
    }

    const notificationChannel = await cachedGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_NOTES
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

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

    await notificationChannel.send({
      embeds: [
        EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle(`Anotação para ${habboTargetStorage}`)
          .addFields([
            {
              name: "🛡️ Autorizado Por",
              value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
            },
          ])
          .setColor(EmbedColors.LalaRed),
      ],
    });

    await interaction.message.delete();

    return;
  }
}
