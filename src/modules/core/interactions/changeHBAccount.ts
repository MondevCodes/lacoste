import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { HabboUser } from "$lib/utilities/habbo";

enum ChangeAccountInputIds {
  oldHabbo = "oldHabbo",
  newHabbo = "newHabbo",

  oldDiscord = "oldDiscord",
  newDiscord = "newDiscord",

  additional = "additional",
}

export function encodeButtonId(action: Action) {
  return `${FormIds.trocarHabboConta}/${action}`;
}

export function decodeButtonId(id: string): Action {
  return id.replace(`${FormIds.trocarHabboConta}/`, "") as Action;
}

export const BASE_BUTTON_ID_REGEX = new RegExp(`^${FormIds.trocarHabboConta}/`);

export type Action = "Request" | "Approve" | "Reject";

type ParsedData = { action: Action };

let existingUser: undefined | any;
let newHabbo: undefined | HabboUser;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ChangeHBAccountInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();

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
      throw new Error("Cannot check permissions outside of a guild.");
    }

    const cachedGuild = await this.container.client.guilds.fetch(
      ENVIRONMENT.GUILD_ID
    );

    if (action === "Request") {
      const { interaction: interactionFromModal, result } =
        await this.container.utilities.inquirer.awaitModal(interaction, {
          title: "Trocar conta do Habbo",
          listenInteraction: true,

          inputs: [
            new TextInputBuilder()
              .setCustomId(ChangeAccountInputIds.oldHabbo)
              .setLabel("Nick ANTIGO do Habbo")
              .setPlaceholder("Ex.: Mamao")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId(ChangeAccountInputIds.newHabbo)
              .setLabel("Nick NOVO do Habbo")
              .setPlaceholder("Ex.: Brendo")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId(ChangeAccountInputIds.additional)
              .setLabel("Observação")
              .setPlaceholder(
                "Caso queira adicionar uma observação escreva aqui, se não deixe vazio"
              )
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false),
          ],
        });

      existingUser = await this.container.prisma.user.findUnique({
        where: {
          habboName: result.oldHabbo,
        },
      });

      if (!existingUser) {
        await interactionFromModal.editReply({
          content: `Não consegui encontrar a conta antiga do Habbo registrado no nosso banco de dados, tem certeza que escreveu corretamente? **${result.oldHabbo}**`,
        });

        return;
      }

      newHabbo = (
        await this.container.utilities.habbo.getProfile(result.newHabbo)
      ).unwrapOr(undefined);

      if (!newHabbo) {
        await interactionFromModal.editReply({
          content: `Não consegui encontrar a conta nova do Habbo no jogo, verifique se escreveu corretamente e se a conta do mesmo está como pública. **${result.newHabbo}**`,
        });

        return;
      }

      const newAlreadyExist = await this.container.prisma.user.findUnique({
        where: {
          habboName: newHabbo.name,
        },
      });

      if (newAlreadyExist) {
        await interactionFromModal.editReply({
          content: `A conta nova do Habbo já está registrada e vinculada. **${newHabbo.name}**`,
        });

        return;
      }

      const authorDB = await this.container.prisma.user.findUnique({
        where: {
          discordId: interaction.user.id,
        },
      });

      if (!authorDB) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o autor da requisição, contate o Desenvolvedor.",
        });

        return;
      }

      const approvalChannel = await cachedGuild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST
      );

      if (!approvalChannel?.isTextBased()) {
        throw new Error("Can't send message to non-text channel.");
      }

      const approvalEmbed = new EmbedBuilder()
        .setTitle("Solicitação de Troca de Conta do HABBO")
        .setColor(EmbedColors.Default)
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .addFields([
          {
            name: "👤 Solicitador",
            value: authorDB.habboName,
          },
          {
            name: ":outbox_tray: Conta ANTIGA",
            value: existingUser.habboName,
            inline: true,
          },
          {
            name: ":inbox_tray: Conta NOVA",
            value: newHabbo.name,
            inline: true,
          },
          {
            name: "🗒️ Observação",
            value:
              result.additional.length > 0
                ? result.additional
                : "* Não houve nenhuma observação.",
            inline: false,
          },
        ])
        .setThumbnail(
          `https://www.habbo.com/habbo-imaging/avatarimage?figure=${newHabbo.figureString}`
        );

      await approvalChannel.send({
        embeds: [approvalEmbed],
        components: [this.#APPROVAL_ROW],
        content: `Apenas para <@&${ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id}>`,
      });

      await interactionFromModal.editReply({
        content: "Solicitação enviada. ✅",
      });
    }

    if (action === "Reject") {
      const member = !(interaction.member instanceof GuildMember)
        ? await cachedGuild.members.fetch(interaction.member.user.id)
        : interaction.member;

      const isAuthorized = this.container.utilities.discord.hasPermissionByRole(
        {
          category: "SECTOR",
          checkFor: "FUNDAÇÃO",
          roles: member.roles,
        }
      );

      if (isAuthorized) {
        await interaction.message.delete();

        return;
      }
    }

    if (action === "Approve") {
      const member = !(interaction.member instanceof GuildMember)
        ? await cachedGuild.members.fetch(interaction.member.user.id)
        : interaction.member;

      const isAuthorized = this.container.utilities.discord.hasPermissionByRole(
        {
          category: "SECTOR",
          checkFor: "FUNDAÇÃO",
          roles: member.roles,
        }
      );

      if (isAuthorized) {
        const notificationChannel = await cachedGuild.channels.fetch(
          ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_CHANGED
        );

        if (!notificationChannel?.isTextBased()) {
          throw new Error("Can't send message to non-text channel.");
        }

        if (!newHabbo) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar a conta nova do Habbo no jogo, contate o Desenvolvedor.",
            components: [],
            embeds: [],
          });

          return;
        }

        if (existingUser.discordLink !== false) {
          const member = await cachedGuild.members.fetch(
            existingUser.discordId
          );

          await member?.setNickname(`· ${newHabbo.name}`).catch(() => null);
        }

        await this.container.prisma.user
          .update({
            where: {
              id: existingUser.id,
            },
            data: {
              habboId: newHabbo.uniqueId,
              habboName: newHabbo.name,
            },
          })
          .catch((error) => {
            interaction.message.edit({
              content: `Não foi possível alterar os dados do usuário no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
              components: [],
              embeds: [],
            });

            return;
          });

        const authorApprovedDB = await this.container.prisma.user.findUnique({
          where: {
            discordId: interaction.user.id,
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
              .setTitle("Troca de conta do Habbo")
              .addFields([
                {
                  name: "🛡️ Autorizado Por",
                  value: authorApprovedDB.habboName,
                },
              ])
              .setColor(EmbedColors.LalaRed),
          ],
        });

        await interaction.message.delete();
      }
    }
  }
}
