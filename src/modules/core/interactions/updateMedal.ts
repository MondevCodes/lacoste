import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  ButtonInteraction,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";

type InGuild = "cached" | "raw";

enum ComplimentInputIds {
  Id = "Id",
  Index = "Index",
  Level = "Level",
  Description = "Description",
  Required = "Required",
}

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class UpdateMedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (interaction.customId !== FormIds.editarMedalha) {
      return this.none();
    }

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[UpdateMedalInteractionHandler#parse] ${interaction.user.tag} tried to perform an action in a DM.`
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
      checkFor: "FUNDAÇÃO",
      category: "SECTOR",
      roles,
    });

    return isAuthorized ? this.some() : this.none();
  }

  public override async run(interaction: ButtonInteraction<InGuild>) {
    const { interaction: interactionFromModal, result: modalResult } =
      await this.container.utilities.inquirer.awaitModal(interaction, {
        title: `Editar Medalha [Configuração]`,
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Id)
            .setLabel("Discord ID da Medalha")
            .setPlaceholder("Ex.: 838328773892")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Index)
            .setLabel("Novo Tipo (Número)")
            .setPlaceholder("> CASO NÃO HOUVER ALTERAÇÃO MANTER VAZIO <")
            .setStyle(TextInputStyle.Short)
            .setRequired(false),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Level)
            .setLabel("Novo Nível")
            .setPlaceholder("> CASO NÃO HOUVER ALTERAÇÃO MANTER VAZIO <")
            .setStyle(TextInputStyle.Short)
            .setRequired(false),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Description)
            .setLabel("Nova Descrição")
            .setPlaceholder("> CASO NÃO HOUVER ALTERAÇÃO MANTER VAZIO <")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Required)
            .setLabel("Novo Requisito")
            .setPlaceholder("> CASO NÃO HOUVER ALTERAÇÃO MANTER VAZIO <")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ],
      });

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const existingMedal = await this.container.prisma.medals.findUnique({
      where: {
        discordId: modalResult.Id,
      },
    });

    if (!existingMedal) {
      await interactionFromModal.editReply({
        content: `O Id escolhido não existe no banco de dados. <@&${modalResult.Id}>`,
        components: [],
        embeds: [],
      });

      return;
    }

    const targetMedal = await guild.roles.fetch(modalResult.Id);

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
        ] as const,
        question: {
          embeds: [
            new EmbedBuilder()
              .setTitle("Medalha")
              .setDescription(
                `Tem certeza que deseja editar a medalha ${targetMedal?.name} // <@&${targetMedal?.id}>?`
              )
              .setColor(EmbedColors.Default),
          ],
          content: "",
        },
      }
    );

    if (isConfirmed.result === "false") {
      await interaction
        .deleteReply()
        .catch(() =>
          this.container.logger.error(
            "[UpdateMedalInteractionHandler] Couldn't delete reply."
          )
        );

      return;
    }

    if (modalResult.Index.length > 0) {
      const medalIndex = Number.parseInt(modalResult.Index);

      await this.container.prisma.medals
        .update({
          where: {
            discordId: modalResult.Id,
          },
          data: {
            index: medalIndex,
          },
        })
        .catch((error) => {
          interactionFromModal.editReply({
            content: `Não foi possível alterar o **Tipo** da Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
            components: [],
            embeds: [],
          });

          return;
        });
    }
    if (modalResult.Level.length > 0) {
      const medalLevel = Number.parseInt(modalResult.Level);

      await this.container.prisma.medals
        .update({
          where: {
            discordId: modalResult.Id,
          },
          data: {
            level: medalLevel,
          },
        })
        .catch((error) => {
          interactionFromModal.editReply({
            content: `Não foi possível alterar o **Nível** da Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
            components: [],
            embeds: [],
          });

          return;
        });
    }
    if (modalResult.Description.length > 0) {
      await this.container.prisma.medals
        .update({
          where: {
            discordId: modalResult.Id,
          },
          data: {
            description: modalResult.Description,
          },
        })
        .catch((error) => {
          interactionFromModal.editReply({
            content: `Não foi possível alterar a **Descrição** da Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
            components: [],
            embeds: [],
          });

          return;
        });
    }
    if (modalResult.Required.length > 0) {
      await this.container.prisma.medals
        .update({
          where: {
            discordId: modalResult.Id,
          },
          data: {
            required: modalResult.Required,
          },
        })
        .catch((error) => {
          interactionFromModal.editReply({
            content: `Não foi possível alterar o **Requisito** da Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
            components: [],
            embeds: [],
          });

          return;
        });
    }

    await interactionFromModal.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Medalha Alterada com Sucesso ✅")
          .addFields([
            {
              name: "ID",
              value: `${targetMedal?.id}`,
            },
            {
              name: "Nome",
              value: `${targetMedal?.name} // <@&${targetMedal?.id}>`,
            },
            {
              name: "Tipo",
              value:
                modalResult.Index.length > 0
                  ? modalResult.Index
                  : "* Não houve alterações",
              inline: true,
            },
            {
              name: "Nível",
              value:
                modalResult.Level.length > 0
                  ? modalResult.Level
                  : "* Não houve alterações",
              inline: true,
            },
            {
              name: "Requisito",
              value:
                modalResult.Required.length > 0
                  ? modalResult.Required
                  : "* Não houve alterações",
              inline: false,
            },
            {
              name: "Descrição",
              value:
                modalResult.Description.length > 0
                  ? modalResult.Description
                  : "* Não houve alterações",
            },
          ])
          .setColor(EmbedColors.LalaRed),
      ],
      components: [],
      content: "",
    });
  }
}
