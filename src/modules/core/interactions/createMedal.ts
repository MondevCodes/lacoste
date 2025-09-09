import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  TextInputStyle,
  TextInputBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  CacheType,
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

const pendingRequests = new Map<string, number>();

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class CreateMedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    const interactionTag = interaction.user.tag;

    if (interaction.customId !== FormIds.criarMedalha) return this.none();

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

  public override async run(
    interaction: ButtonInteraction<InGuild>
  ): Promise<void> {
    const userId = interaction.user.id;

    if (pendingRequests.has(userId)) {
      const startTime = pendingRequests.get(userId)!;
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.ceil((60 * 1000 - elapsedTime) / 1000);

      await interaction.reply({
        content: `⏳ Você já tem uma criação de medalha em andamento. Aguarde **${remainingTime}s** para evitar duplicidades antes de tentar novamente.`,
        ephemeral: true,
      });
      return;
    }

    pendingRequests.set(userId, Date.now());

    try {
      const { interaction: interactionFromModal, result } =
        await this.container.utilities.inquirer.awaitModal(interaction, {
          title: "Criar Medalha [Configuração]",
          listenInteraction: true,
          timeout: 60 * 1000,

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
                "Para verificar já existentes botão 'Listar Medalhas'."
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

      await this.processMedalCreation(interactionFromModal, result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      this.container.logger.error(
        `[CreateMedalInteractionHandler#run] Ocorreu um erro com o discordId ${userId}: ${errorMessage}`
      );

      if (errorMessage.includes("time") || errorMessage.includes("timeout")) {
        this.container.logger.info(
          `[CreateMedalInteractionHandler#run] Modal timeout para o discordId ${userId}`
        );
        return;
      }

      if (interaction.replied === false && interaction.deferred === false)
        await interaction.reply({
          content: "❌ Ocorreu um erro ao processar a modal. Tente novamente.",
          ephemeral: true,
        });
    } finally {
      pendingRequests.delete(userId);
    }
  }

  private async processMedalCreation(
    interactionFromModal: ModalSubmitInteraction<CacheType>,
    result: Record<string, string>
  ): Promise<void> {
    const existingMedal = await this.container.prisma.medals.findUnique({
      where: {
        discordId: result.Id,
      },
    });

    if (existingMedal) {
      await interactionFromModal.editReply({
        content: `⚠️ O Id escolhido já existe no banco de dados. <@&${result.Id}>`,
      });
      return;
    }

    const medalIndex = Number.parseInt(result.Index);
    const medalLevel = Number.parseInt(result.Level);

    if (medalLevel > 3 || medalLevel < 1) {
      await interactionFromModal.editReply({
        content: `❌ O nível da medalha deve ser entre 1 a 3, você escolheu **${medalLevel}**`,
      });
      return;
    }

    if (medalIndex < 0) {
      await interactionFromModal.editReply({
        content: `❌ O tipo da medalha deve ser MAIOR ou IGUAL a 0, você escolheu **${medalIndex}**`,
      });
      return;
    }

    const guild =
      interactionFromModal.guild ??
      (await interactionFromModal.client.guilds.fetch(
        interactionFromModal.guildId
      ));

    if (!guild.roles.cache.has(result.Id)) {
      await interactionFromModal.editReply({
        content: `❌ O Id escolhido não existe no seu Servidor. <@&${result.Id}>`,
      });
      return;
    }

    const existingMedalWithIndexLevel =
      await this.container.prisma.medals.findMany({
        where: {
          index: medalIndex,
          level: medalLevel,
        },
      });

    if (existingMedalWithIndexLevel.length) {
      await interactionFromModal.editReply({
        content:
          "⚠️ O Tipo escolhido com o Nível escolhido já existe no banco de dados.",
      });
      return;
    }

    const targetMedal = await guild.roles.fetch(result.Id);

    try {
      await this.container.prisma.medals.create({
        data: {
          discordId: result.Id,
          index: medalIndex,
          level: medalLevel,
          required: result.Required,
          description: result.Description,
        },
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
    } catch (error) {
      this.container.logger.error(
        `[CreateMedalInteractionHandler#processMedalCreation] Database error com o discordId ${
          interactionFromModal.user?.id
        }: ${error instanceof Error ? error.message : "Erro desconhecido"}`
      );

      await interactionFromModal.editReply({
        content: `❌ Não foi possível criar a Medalha no banco de dados, contate o Desenvolvedor. Erro: ||${
          error instanceof Error ? error.message : "Erro desconhecido"
        }||`,
      });
    }
  }
}
