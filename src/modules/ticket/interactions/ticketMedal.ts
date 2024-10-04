import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  User,
  time,
} from "discord.js";
import { z } from "zod";
import { ENVIRONMENT } from "$lib/env";
import { TicketStatus } from "@prisma/client";
import { EmbedColors } from "$lib/constants/discord";

const ActionData = z.object({
  id: z
    .string()
    .refine((value) => value && /^[a-f\d]{24}$/i.test(value), {
      message: "Invalid ObjectId",
    })
    .optional(),

  action: z.enum(["OpenDefault", "OpenPraise", "End"]),
});

type ActionData = z.infer<typeof ActionData>;

export const BASE_BUTTON_ID = "LCST::OmbudsmanMedalInteractionHandler";
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

export function encodeButtonId(data: ActionData) {
  return `${BASE_BUTTON_ID}/${JSON.stringify(data)}`;
}

export const READ_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

export interface TicketsCreateOptions {
  /* The user to create the ticket for. */
  user: User;

  /* The reason for creating the ticket. */
  reason: string;
}

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class OmbudsmanInteractionHandler extends InteractionHandler {
  #ticketsCategory?: CategoryChannel;

  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) {
      return this.none();
    }

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[OmbudsmanInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return this.none();
    }

    const { id, action } = ActionData.parse(
      JSON.parse(interaction.customId.split("/")[1])
    );

    return this.some({ id, action });
  }

  public override async run(
    interaction: ButtonInteraction<"cached" | "raw">,
    { id, action }: ActionData
  ) {
    this.container.logger.info("InteractionHandler Ticket Runned");
    this.container.logger.info(
      `Ticket Channel: ${ENVIRONMENT.TICKETS_CATEGORY}`
    );
    if (action === "OpenDefault" || action === "OpenPraise") {
      this.#ticketsCategory ??= (await this.container.client.channels.fetch(
        ENVIRONMENT.TICKETS_CATEGORY
      )) as CategoryChannel;

      this.container.logger.info(
        `TicketsCategory: ${this.#ticketsCategory}, TicketsCategoryGuildId: ${
          this.#ticketsCategory.guildId
        }`
      );
      this.container.logger.info(`userId: ${interaction.user.id}`);

      const ticketChannel = await this.#ticketsCategory.children.create({
        type: ChannelType.GuildText,
        name: `${interaction.user.username}-${Math.random()
          .toString(36)
          .substring(2, 6)}`,
        permissionOverwrites: [
          {
            id: interaction.user.id,
            allow: READ_PERMISSIONS,
          },
          {
            id: this.#ticketsCategory.guildId,
            deny: READ_PERMISSIONS,
          },
          {
            id: ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id,
            allow: READ_PERMISSIONS,
          },
          {
            id: ENVIRONMENT.SECTORS_ROLES.FEDERAÇÃO.id,
            allow: READ_PERMISSIONS,
          },
        ],
      });

      const ticketMessage = await ticketChannel.send({
        content: "\u200B",
      });

      const ticket = await this.container.prisma.ticket.create({
        data: {
          reason: "AUTO",
          status: TicketStatus.Open,
          messageId: ticketMessage.id,
          channelId: ticketChannel.id,
        },
        select: {
          id: true,
        },
      });

      const closeTicketButton = new ButtonBuilder()
        .setCustomId(encodeButtonId({ id: ticket.id, action: "End" }))
        .setStyle(ButtonStyle.Danger)
        .setLabel("Fechar Ticket");

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        closeTicketButton
      );

      const ticketEmbed = new EmbedBuilder()
        .setColor(EmbedColors.Default)
        .setTitle("Ouvidoria")
        .setDescription(
          `Olá, <@${interaction.user.id}>! Um fundador/federador irá respondê-lo em alguns instantes.`
        )
        .setFooter({
          text: ticket.id,
        });

      await ticketMessage.edit({
        embeds: [ticketEmbed],
        components: [actionRow],
        content: `<@&${ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id}> <@&${ENVIRONMENT.SECTORS_ROLES.FEDERAÇÃO.id}> <@${interaction.user.id}>`,
        allowedMentions: {
          users: [interaction.user.id],
          roles: [
            ENVIRONMENT.SECTORS_ROLES.FUNDAÇÃO.id,
            ENVIRONMENT.SECTORS_ROLES.FEDERAÇÃO.id,
          ],
        },
      });

      const dmChannel =
        interaction.user.dmChannel || (await interaction.user.createDM());

      const dmMessage = await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Criação de solicitação de Ticket de Medalha")
            .setDescription(
              `Seu ticket foi criado com Sucesso! Clique aqui: ${ticketChannel}`
            )
            .setFooter({
              text: "Essa mensagem será apagada automaticamente em 1 minuto",
            }),
        ],
      });

      setTimeout(() => {
        dmMessage.delete();
      }, 60000);

      // await interaction.editReply({
      //   content: `Seu ticket de Medalha foi criado com Sucesso! Clique aqui: ${ticketChannel}`,
      // });

      return;
    }

    if (id) await this.#end(interaction, id);
  }

  async #end(interaction: ButtonInteraction, id: string) {
    const guild = await this.container.utilities.discord.getGuild();
    const member = await guild.members.fetch(interaction.user.id);

    // const hasPermission = this.container.utilities.discord.hasPermissionByRole({
    // 	category: "SECTOR",
    // 	checkFor: "FUNDAÇÃO",
    // 	roles: member.roles,
    // });

    const hasPermission = member.roles.cache.has("985260931498000475");

    if (!hasPermission) {
      await interaction.reply({
        content:
          "Não autorizado. Você precisa ter o cargo de <@&985260931498000475> para fechar o Ticket.",
        ephemeral: true,
      });

      return;
    }

    const ticket = await this.container.prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      await interaction.reply({
        content: "Ticket não encontrado.",
        ephemeral: true,
      });

      return;
    }

    await this.container.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.Closed },
    });

    const ticketChannel = await this.container.client.channels.fetch(
      ticket.channelId
    );

    if (!ticketChannel) {
      await interaction.reply({
        content: "||TK207|| Ticket não encontrado, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    if (!ticketChannel.isTextBased()) {
      await interaction.reply({
        content:
          "||TK216|| Ticket não é um canal de texto, contate o desenvolvedor.",
        ephemeral: true,
      });

      return;
    }

    const ticketMessages = await ticketChannel.messages.fetch({
      after: ticket.messageId,
    });

    const formattedTicketHistory = ticketMessages
      .map(
        (message) =>
          `[${message.author.id}/@${message.author.tag}]: ${message.content}`
      )
      .join("\n");

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.TICKETS
    );

    const participants = Array.from(
      new Set(
        ticketMessages
          .map((message) => message.author)
          .filter((user) => user.id !== interaction.user.id)
      )
    );

    if (notificationChannel?.isTextBased()) {
      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Ticket solicitação de Medalha encerrado")
            .setDescription(
              `Ticket encerrado por ${interaction.user}, os registros das mensagens estão anexadas abaixo.`
            )
            .addFields([
              {
                name: "Participantes",
                value:
                  participants.length >= 1
                    ? participants.join(", ")
                    : "Sem participantes",
              },
              {
                name: "Criado Em",
                value: time(ticket.createdAt, "F"),
              },
            ]),
        ],

        ...(formattedTicketHistory.length > 0 && {
          files: [
            new AttachmentBuilder(Buffer.from(formattedTicketHistory), {
              name: "messages.txt",
            }),
          ],
        }),
      });
    }

    await ticketChannel.delete();
  }
}
