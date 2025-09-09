import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  ButtonInteraction,
  ButtonStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";

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
    const interactionTag = interaction.user.tag;

    if (interaction.customId !== FormIds.deletarMedalha) {
      return this.none();
    }

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[MedalInteractionHandler#parse] ${interactionTag} tried to perform an action in a DM.`
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

    await interaction.reply({
      content: "Carregando medalhas...",
      ephemeral: true,
    });

    const medalChoices = (
      await Promise.all(
        values(allMedals).map(
          async (value) =>
            value.discordId &&
            (guild.roles.cache.get(value.discordId) ??
              (await guild.roles.fetch(value.discordId)))
        )
      )
    )
      .filter(Boolean)
      .map((medal) => ({
        id: medal.id,
        label: medal.name,
      }));

    if (medalChoices.length === 0) {
      await interaction.editReply({
        content: "❌ Não há medalhas cadastradas no sistema.",
      });
      return;
    }

    let currentPage = 0;
    let targetMedalId: string | null = null;

    while (!targetMedalId) {
      try {
        targetMedalId = await this.createMedalSelectMenu(
          interaction,
          medalChoices,
          currentPage
        );
      } catch (error: any) {
        if (error?.customId === "next") {
          currentPage++;
          continue;
        } else if (error?.customId === "prev") {
          currentPage--;
          continue;
        }

        await interaction.editReply({
          content: "⏰ Tempo esgotado ou erro inesperado.",
          components: [],
        });
        return;
      }
    }

    const existingMedal = await this.container.prisma.medals.findUnique({
      where: {
        discordId: targetMedalId,
      },
    });

    if (!existingMedal) {
      await interaction.editReply({
        content: `❌ O Id escolhido não existe no banco de dados. <@&${targetMedalId}>`,
        components: [],
      });
      return;
    }

    const targetMedal = await guild.roles.fetch(targetMedalId);

    const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_delete")
        .setLabel("✅ Sim, deletar")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_delete")
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Confirmação de Exclusão")
          .setDescription(
            `Tem certeza que deseja deletar a medalha **${targetMedal?.name}** (<@&${targetMedal?.id}>)?`
          )
          .setColor(EmbedColors.Default),
      ],
      components: [confirmButtons],
      content: "",
    });

    const confirmResponse = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 30000,
    });

    if (!confirmResponse) {
      await interaction.editReply({
        content: "⏰ Tempo esgotado. Operação cancelada.",
        components: [],
        embeds: [],
      });
      return;
    }

    await confirmResponse.deferUpdate();

    if (confirmResponse.customId === "cancel_delete") {
      await interaction.editReply({
        content: "❌ Operação cancelada.",
        components: [],
        embeds: [],
      });
      return;
    }

    try {
      await this.container.prisma.medals.delete({
        where: {
          discordId: targetMedalId,
        },
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
        content: "",
      });
    } catch (error) {
      this.container.logger.error(
        `[DeleteMedalInteractionHandler] Database error: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`
      );

      await interaction.editReply({
        content: `❌ Não foi possível deletar a medalha no banco de dados. Contate o desenvolvedor. Erro: ||${
          error instanceof Error ? error.message : "Erro desconhecido"
        }||`,
        components: [],
        embeds: [],
      });
    }
  }

  private async createMedalSelectMenu(
    interaction: ButtonInteraction<InGuild>,
    medals: Array<{ id: string; label: string }>,
    page: number = 0,
    pageSize: number = 24
  ) {
    const totalPages = Math.ceil(medals.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const currentPageMedals = medals.slice(start, end).map((medal) => ({
      label: medal.label,
      value: medal.id,
    }));

    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("medal-select")
          .setPlaceholder(
            `Página ${
              page + 1
            }/${totalPages} - Selecione uma medalha para deletar`
          )
          .addOptions(currentPageMedals)
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("← Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("Próximo →")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );

    await interaction.editReply({
      content: "Selecione a medalha que deseja deletar:",
      components: [selectMenu, buttons],
    });

    const response = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 60000,
    });

    if (!response) throw new Error("Tempo esgotado");

    if (response.customId === "prev" || response.customId === "next") {
      await response.deferUpdate();
      throw { customId: response.customId };
    }

    await response.deferUpdate();
    return response.isStringSelectMenu() ? response.values[0] : null;
  }
}
