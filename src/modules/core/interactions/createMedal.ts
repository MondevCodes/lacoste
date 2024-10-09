import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  TextInputStyle,
  TextInputBuilder,
  ButtonInteraction,
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
export class CreateMedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (interaction.customId !== FormIds.criarMedalha) {
      return this.none();
    }

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[MedalInteractionHandler#parse] ${interaction.user.tag} tried to perform an action in a DM.`
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
    const { interaction: interactionFromModal, result } =
      await this.container.utilities.inquirer.awaitModal(interaction, {
        title: "Criar Medalha [Configuração]",
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
            .setLabel("Tipo (Número)")
            .setPlaceholder(
              "Escolha o número do tipo da medalha. Por exemplo 'Estrela' é tipo 1, então as 3 medalhas 'Estrela' de níveis diferentes são tipo 1. Para verificar os tipos já existentes veja no botão 'Listar Medalhas'."
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Level)
            .setLabel("Nível")
            .setPlaceholder("Número de 1 a 3.")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Description)
            .setLabel("Descrição")
            .setPlaceholder("Ex.: Demonstração de boa fé...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Required)
            .setLabel("Requisito")
            .setPlaceholder("Ex.: Completou 3 anos...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ],
      });

    const medalIndex = Number.parseInt(result.Index);
    const medalLevel = Number.parseInt(result.Level);

    if (medalLevel > 3 || medalLevel < 1) {
      await interactionFromModal.editReply({
        content: `O nível da medalha deve ser entre 1 a 3, você escolheu **${medalLevel}**`,
      });

      return;
    }

    if (medalIndex < 0) {
      await interactionFromModal.editReply({
        content: `O tipo da medalha deve ser MAIOR ou IGUAL a 0, você escolheu **${medalIndex}**`,
      });

      return;
    }

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    if (!guild.roles.cache.has(result.Id)) {
      await interactionFromModal.editReply({
        content: `O Id escolhido não existe no seu Servidor. <@&${result.Id}>`,
      });

      return;
    }

    const targetMedal = await guild.roles.fetch(result.Id);

    const existingMedal = await this.container.prisma.medals.findUnique({
      where: {
        discordId: result.Id,
      },
    });

    if (existingMedal) {
      await interactionFromModal.editReply({
        content: `O Id escolhido já existe no banco de dados. <@&${result.Id}>`,
      });

      return;
    }

    await this.container.prisma.medals
      .create({
        data: {
          discordId: result.Id,
          index: medalIndex,
          level: medalLevel,
          required: result.Required,
          description: result.Description,
        },
      })
      .catch((error) => {
        interactionFromModal.editReply({
          content: `Não foi possível criar a Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
        });

        return;
      });

    await interactionFromModal.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Criação de Medalha Concluída ✅")
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
              value: medalIndex.toString(),
              inline: true,
            },
            {
              name: "Nível",
              value: medalLevel.toString(),
              inline: true,
            },
            {
              name: "Requisito",
              value: result.Required,
              inline: false,
            },
            {
              name: "Descrição",
              value: result.Description,
            },
          ])
          .setColor(EmbedColors.LalaRed),
      ],
    });
  }
}
