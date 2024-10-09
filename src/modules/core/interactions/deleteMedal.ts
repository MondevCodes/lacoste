import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { EmbedBuilder, ButtonInteraction, ButtonStyle } from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { values } from "remeda";

type InGuild = "cached" | "raw";

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
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const allMedals = await this.container.prisma.medals.findMany();

    const medalChoices = await Promise.all(
      values(allMedals).map(
        async (value) =>
          value.discordId &&
          (guild.roles.cache.get(value.discordId) ??
            (await guild.roles.fetch(value.discordId)))
      )
    );

    const [targetMedalId] =
      await this.container.utilities.inquirer.awaitSelectMenu(interaction, {
        choices: [
          ...medalChoices.filter(Boolean).map((medal) => ({
            id: medal.id,
            label: medal.name,
          })),
        ],
        placeholder: "Selecionar",
        question: "Selecione a medalha que deseja deletar.",
      });

    const existingMedal = await this.container.prisma.medals.findUnique({
      where: {
        discordId: targetMedalId,
      },
    });

    if (!existingMedal) {
      await interaction.reply({
        content: `O Id escolhido não existe no banco de dados. <@&${targetMedalId}>`,
      });

      return;
    }

    const targetMedal = await guild.roles.fetch(targetMedalId);

    const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
      interaction,
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
          content: "",
        },
      }
    );

    if (isConfirmed.result === "false") {
      await interaction
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
          discordId: targetMedalId,
        },
      })
      .catch((error) => {
        interaction.editReply({
          content: `Não foi possível deletar a Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${error}|| `,
        });

        return;
      });

    await interaction.editReply({
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
