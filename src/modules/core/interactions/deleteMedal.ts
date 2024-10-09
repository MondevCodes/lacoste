import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  TextInputStyle,
  TextInputBuilder,
  ButtonInteraction,
  ButtonStyle,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";

type InGuild = "cached" | "raw";

enum ComplimentInputIds {
  Id = "Id",
}

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DeleteMedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (interaction.customId !== FormIds.deletarMedalha) {
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
        title: "Deletar Medalha [Configuração]",
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId(ComplimentInputIds.Id)
            .setLabel("Discord ID da Medalha")
            .setPlaceholder("Ex.: 838328773892")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ],
      });

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

    if (!existingMedal) {
      await interactionFromModal.editReply({
        content: `O Id escolhido não existe no banco de dados. <@&${result.Id}>`,
      });

      return;
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
        ] as const,
        question: {
          embeds: [
            new EmbedBuilder()
              .setTitle("Medalha")
              .setDescription(
                `Tem certeza que deseja deletar a Medalha ${targetMedal?.name} // <@&${targetMedal?.id}>?`
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
            "[DeleteMedalInteractionHandler] Couldn't delete reply."
          )
        );

      return;
    }

    await this.container.prisma.medals
      .delete({
        where: {
          discordId: result.Id,
        },
      })
      .catch((error) => {
        interactionFromModal.editReply({
          content: `Não foi possível deletar a Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
        });

        return;
      });

    await interactionFromModal.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Medalha Deletada com Sucesso ✅")
          .addFields([
            {
              name: "ID",
              value: `${targetMedal?.id}`,
            },
            {
              name: "Nome",
              value: `${targetMedal?.name} // <@&${targetMedal?.id}>`,
            },
          ])
          .setColor(EmbedColors.LalaRed),
      ],
      components: [],
    });
  }
}
