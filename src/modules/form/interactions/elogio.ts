import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum ComplimentInputIds {
  Target = "Target",
  Description = "Description",
}

type FeedbackInput = keyof typeof ComplimentInputIds;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ComplimentFormInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) {
      throw new Error("Cannot check permissions outside of a guild.");
    }

    return interaction.customId === FormIds.Elogio ? this.some() : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const { result, interaction: interactionFromModal } =
      await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
              .setLabel("Elogiar Todos ou Específico")
              .setPlaceholder("Informe o nick do Habbo ou escreva: todos")
              .setCustomId(ComplimentInputIds.Target)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Descrição do Elogio")
              .setPlaceholder("Ex.: Continue com o seu bom esforço...")
              .setCustomId(ComplimentInputIds.Description)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ],
          listenInteraction: true,
          title: "Enviar Elogios",
        }
      );

    if (result.Target.toLowerCase() !== "todos") {
      const onlyHabbo = (
        await this.container.utilities.habbo.getProfile(result.Target)
      ).unwrapOr(undefined);

      if (!onlyHabbo?.name) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o perfil do usuário no Habbo, talvez sua conta esteja deletada ou renomeada? Veja se o perfil do usuário no jogo está como público.",
        });

        return;
      }

      const targetDBHabbo = await this.container.prisma.user.findUnique({
        where: { habboId: onlyHabbo.uniqueId },
        select: {
          id: true,
          discordId: true,
          habboName: true,
          discordLink: true,
        },
      });

      if (!targetDBHabbo) {
        await interactionFromModal.editReply({
          content:
            "Não consegui encontrar o usuário informado vinculado no nosso banco de dados. Verifique se o mesmo está realmente vinculado **ou vincule-o**",
        });

        return;
      }

      const authorDB = await this.container.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        select: {
          id: true,
          discordId: true,
          habboName: true,
          discordLink: true,
        },
      });

      const guild =
        interaction.guild ??
        (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

      const embed = new EmbedBuilder()
        .setTitle("Recebemos um super elogio! ❤️")
        .setDescription(
          `**${
            authorDB?.habboName ?? `<@${authorDB?.discordId}>`
          }** enviou um elogio para **${
            onlyHabbo.name ?? targetDBHabbo.habboName
          }**! \n
          **================================** \n
          ${result.Description}`
        )
        .setImage(
          "https://cdn.discordapp.com/attachments/1262854857883389972/1283982013799465001/20240818_122627.gif?ex=66f76def&is=66f61c6f&hm=cf0d23825be1f20f473ff3704ef5eb4968ece680b1eb5016e149cf172031f3f2&"
        )
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setColor(EmbedColors.LalaRed)
        .setFooter({
          text: "Fique a vontade para enviar um elogio também, veja como no canal da ouvidoria.",
        });

      const channel = await guild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.GERAL
      );

      if (channel === null || !channel.isTextBased()) {
        throw new Error(
          "Form evaluation channel not found or not a text channel."
        );
      }

      await channel.send({
        embeds: [embed],
      });

      if (targetDBHabbo.discordLink !== false) {
        await channel.send(
          `<@${interaction.user.id}> 📨 <@${targetDBHabbo.discordId}>`
        );
      }
    } else {
      const authorDB = await this.container.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        select: {
          id: true,
          discordId: true,
          habboName: true,
          discordLink: true,
        },
      });

      const guild =
        interaction.guild ??
        (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

      const embed = new EmbedBuilder()
        .setTitle("Recebemos um super elogio! ❤️")
        .setDescription(
          `**${
            authorDB?.habboName ?? `<@${authorDB?.discordId}>`
          }** nos enviou um elogio! \n
          **================================** \n
          ${result.Description}`
        )
        .setImage(
          "https://cdn.discordapp.com/attachments/1262854857883389972/1283982013799465001/20240818_122627.gif?ex=66f76def&is=66f61c6f&hm=cf0d23825be1f20f473ff3704ef5eb4968ece680b1eb5016e149cf172031f3f2&"
        )
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setColor(EmbedColors.LalaRed)
        .setFooter({
          text: "Fique a vontade para enviar um elogio também, veja como no canal da ouvidoria.",
        });

      const channel = await guild.channels.fetch(
        ENVIRONMENT.NOTIFICATION_CHANNELS.GERAL
      );

      if (channel === null || !channel.isTextBased()) {
        throw new Error(
          "Form evaluation channel not found or not a text channel."
        );
      }

      await channel.send({
        embeds: [embed],
      });

      await channel.send(`<@${interaction.user.id}> 📨 @everyone`);
    }
    interactionFromModal.deleteReply();
  }
}
