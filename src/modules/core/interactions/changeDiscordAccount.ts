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
  Role,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum ChangeAccountInputIds {
  oldHabbo = "oldHabbo",
  newHabbo = "newHabbo",

  oldDiscord = "oldDiscord",
  newDiscord = "newDiscord",

  additional = "additional",
}

export function encodeButtonId(action: Action) {
  return `${FormIds.trocarDiscordConta}/${action}`;
}

export function decodeButtonId(id: string): Action {
  return id.replace(`${FormIds.trocarDiscordConta}/`, "") as Action;
}

export const BASE_BUTTON_ID_REGEX = new RegExp(
  `^${FormIds.trocarDiscordConta}/`
);

export type Action = "Request" | "Approve" | "Reject";

type ParsedData = { action: Action };

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ChangeDiscordAccountInteractionHandler extends InteractionHandler {
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
          title: "Trocar conta do Discord",
          listenInteraction: true,

          inputs: [
            new TextInputBuilder()
              .setCustomId(ChangeAccountInputIds.oldDiscord)
              .setLabel("Id ANTIGO do Discord")
              .setPlaceholder("Ex.: 838328773892")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId(ChangeAccountInputIds.newDiscord)
              .setLabel("Id NOVO do Discord")
              .setPlaceholder("Ex.: 938628793835")
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

      const oldUser = await cachedGuild.members.fetch(result.oldDiscord);

      if (!oldUser) {
        await interactionFromModal.editReply({
          content: `Não consegui encontrar a conta nova do Discord no Servidor, verifique se escreveu corretamente. **${result.oldDiscord}**`,
        });

        return;
      }

      const existingUser = await this.container.prisma.user.findUnique({
        where: {
          discordId: oldUser.user.id,
        },
      });

      if (!existingUser) {
        await interactionFromModal.editReply({
          content: `Não consegui encontrar a conta antiga do Discord registrado no nosso banco de dados, tem certeza que escreveu corretamente? **${result.oldDiscord}**`,
        });

        return;
      }

      const newUser = await cachedGuild.members.fetch(result.newDiscord);

      if (!newUser) {
        await interactionFromModal.editReply({
          content: `Não consegui encontrar a conta nova do Discord no Servidor, verifique se escreveu corretamente. **${result.newDiscord}**`,
        });

        return;
      }

      const newAlreadyExist = await this.container.prisma.user.findUnique({
        where: {
          discordId: newUser.user.id,
        },
      });

      if (newAlreadyExist) {
        await interactionFromModal.editReply({
          content: `A conta nova do Discord já está registrada e vinculada. <@${newAlreadyExist.discordId}>`,
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
        .setTitle("Solicitação de Troca de Conta do DISCORD")
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
            value: `<@${existingUser.discordId}>`,
            inline: true,
          },
          {
            name: ":inbox_tray: Conta NOVA",
            value: `<@${newUser.user.id}>`,
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
          {
            name: ":information_source: :red_square: Id Antigo",
            value: result.oldDiscord,
            inline: true,
          },
          {
            name: ":information_source: :green_square: Id Novo",
            value: result.newDiscord,
            inline: true,
          },
        ])
        .setThumbnail(newUser.user.displayAvatarURL());

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

        const embedFields = interaction.message.embeds[0].fields;

        const newDiscordField = embedFields.find(
          (field) =>
            field.name === ":information_source: :green_square: Id Novo"
        );

        if (!newDiscordField) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar o campo ':information_source: :green_square: Id Novo' no Embed, contate o Desenvolvedor.",
            components: [],
            embeds: [],
          });

          return;
        }

        const newDiscord = await cachedGuild.members.fetch(
          newDiscordField.value
        );

        if (!newDiscord) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar a conta nova do Discord no Servidor, contate o Desenvolvedor.",
            components: [],
            embeds: [],
          });

          return;
        }

        const existingUserField = embedFields.find(
          (field) =>
            field.name === ":information_source: :red_square: Id Antigo"
        );

        if (!existingUserField) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar o campo ':information_source: :red_square: Id Antigo' no Embed, contate o Desenvolvedor.",
            components: [],
            embeds: [],
          });

          return;
        }

        const existingUser = await this.container.prisma.user.findUnique({
          where: {
            discordId: existingUserField.value,
          },
        });

        if (!existingUser) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar a conta antiga do Discord registrado no nosso banco de dados, contate o Desenvolvedor",
          });

          return;
        }

        const oldDiscord = await cachedGuild.members.fetch(
          existingUser?.discordId
        );

        if (!oldDiscord) {
          await interaction.message.edit({
            content:
              "Não consegui encontrar a conta antiga do Discord no Servidor, contate o Desenvolvedor",
          });

          return;
        }

        const userMedals = await this.container.prisma.medals.findMany({
          where: {
            users: {
              has: existingUser.discordId,
            },
          },
        });

        if (userMedals.length > 0) {
          for await (const medal of userMedals) {
            await this.container.prisma.medals.update({
              where: {
                discordId: medal.discordId,
              },
              data: {
                users: {
                  set: medal.users.filter(
                    (id) => id !== existingUser.discordId
                  ),
                },
              },
            });

            await this.container.prisma.medals.update({
              where: {
                discordId: medal.discordId,
              },
              data: {
                users: {
                  push: newDiscord.user.id,
                },
              },
            });
          }
        }

        await newDiscord
          ?.setNickname(`· ${existingUser.habboName}`)
          .catch(() => null);

        await this.container.prisma.user
          .update({
            where: {
              id: existingUser.id,
            },
            data: {
              discordId: newDiscord.user.id,
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

        await oldDiscord?.setNickname(oldDiscord.user.tag).catch(() => null);

        for await (const role of oldDiscord.roles.cache) {
          await cachedGuild.members
            .addRole({
              user: newDiscord.id,
              role: role[1],
            })
            .catch(() =>
              this.container.logger.error(
                "[ChangeDiscordAccount#run] Error to add role to newDiscord"
              )
            );
        }

        for await (const role of oldDiscord.roles.cache) {
          await cachedGuild.members
            .removeRole({
              user: oldDiscord.id,
              role: role[1],
            })
            .catch(() =>
              this.container.logger.error(
                "[ChangeDiscordAccount#run] Error to remove role of oldDiscord"
              )
            );
        }

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
              .setTitle("Troca de conta do Discord")
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

        this.switchAccountDiscordLogRole(
          existingUser.discordId,
          newDiscord.user.id,
          existingUser.habboName
        );
      }
    }
  }

  // Swaps the user's discord account loads to the current account
  async switchAccountDiscordLogRole(
    oldDiscord: string,
    updatedDiscord: string,
    habboName: string
  ) {
    const logGuild = await this.container.client.guilds.fetch(
      ENVIRONMENT.LOG_GUILD_ID
    );

    const notificationChannel = await logGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.WELCOME_LOG
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    let oldMember: GuildMember | null = await logGuild.members
      .fetch(oldDiscord)
      .catch((error) => {
        this.container.logger.warn(
          `User ${oldDiscord} (older discord) not found in log server: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        return null;
      });

    let member: GuildMember | null = await logGuild.members
      .fetch(updatedDiscord)
      .catch((error) => {
        this.container.logger.warn(
          `User ${updatedDiscord} (newer discord) not found in log server: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        return null;
      });

    if (!oldMember || !member) return;

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(habboName)
    ).unwrapOr(undefined);

    if (!onlyHabbo?.name) {
      console.warn(
        "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público."
      );
    }

    let userRole: Role | null = null;

    for await (const role of oldMember.roles.cache) {
      await logGuild.members
        .addRole({
          user: updatedDiscord,
          role: role[1],
        })
        .catch(() =>
          this.container.logger.error(
            "[ChangeDiscordAccount#switchAccountDiscordLogRole] Error to add role to newest Discord account."
          )
        );
    }

    for await (const role of member.roles.cache) {
      await logGuild.members
        .removeRole({
          user: oldDiscord,
          role: role[1],
        })
        .catch(() =>
          this.container.logger.error(
            "[ChangeDiscordAccount#switchAccountDiscordLogRole] Error to remove role of oldDiscord"
          )
        );

      if (!role[1].name.match("everyone")) userRole = role[1];
    }

    await notificationChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Troca de Conta Discord de ***${habboName}*** 📝`)
          .addFields([
            {
              name: "Ação:",
              value: `Atualização de conta do Discord 🪪`,
            },
            {
              name: "💼 Cargo:",
              value: `<@&${userRole?.id}>`,
            },
            {
              name: "📤 Discord Anterior:",
              value: `<@${oldDiscord}>`,
              inline: true,
            },
            {
              name: "📥 Discord Atual:",
              value: `<@${updatedDiscord}>`,
              inline: true,
            },
          ])
          .setColor(EmbedColors.LalaRed)
          .setThumbnail(member.user.displayAvatarURL()),
      ],
    });
  }
}
