import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
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
    if (interaction.customId !== FormIds.listarMedalhas) {
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

  private async createMedalSelectMenu(
    interaction: ButtonInteraction<InGuild>,
    medals: Array<{ id: string; label: string }>,
    page: number = 0,
    pageSize: number = 24
  ) {
    const totalPages = Math.ceil(medals.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const currentPageMedals = medals.slice(start, end);

    const [selectedId] =
      await this.container.utilities.inquirer.awaitSelectMenu(interaction, {
        choices: currentPageMedals,
        placeholder: `Página ${page + 1}/${totalPages}`,
        question: "Selecione a medalha que deseja visualizar",
        components: [
          {
            type: ComponentType.Button,
            customId: "prev",
            label: "← Anterior",
            style: ButtonStyle.Secondary,
            disabled: page === 0,
          },
          {
            type: ComponentType.Button,
            customId: "next",
            label: "Próximo →",
            style: ButtonStyle.Secondary,
            disabled: page >= totalPages - 1,
          },
        ],
        embeds: [],
        content: "",
      });

    return selectedId;
  }

  public override async run(interaction: ButtonInteraction<InGuild>) {
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const listOptions = await this.container.utilities.inquirer.awaitButtons(
      interaction,
      {
        choices: [
          {
            id: "one",
            label: "Apenas uma",
            style: ButtonStyle.Primary,
          },
          {
            id: "all",
            label: "Lista completa",
            style: ButtonStyle.Secondary,
          },
        ] as const,
        question: {
          embeds: [
            new EmbedBuilder()
              .setTitle("Opções de visualizar Medalhas")
              .setDescription(
                "Deseja ver apenas uma medalha selecionada aqui ou a lista completa na sua DM?"
              )
              .setColor(EmbedColors.Default),
          ],
          content: "",
        },
      }
    );

    const medalsDB = await this.container.prisma.medals.findMany();

    if (listOptions.result === "all") {
      const dmChannel =
        interaction.user.dmChannel || (await interaction.user.createDM());

      interaction.editReply({
        content: "Te mandei a lista completa na sua DM do Discord ✅",
        components: [],
        embeds: [],
      });

      await dmChannel.send({
        content: `**LISTA MEDALHAS INÍCIO** [${new Date().toLocaleDateString(
          "pt-BR"
        )}]`,
      });

      for await (const medal of medalsDB) {
        const targetMedal = await guild.roles.fetch(medal.discordId);

        const usersWithMedalDB = await Promise.all(
          medal.users.map(async (userDiscordId) => {
            return await this.container.prisma.user.findUnique({
              where: { discordId: userDiscordId },
              select: {
                habboName: true,
              },
            });
          })
        );

        const usersWithMedal = usersWithMedalDB
          .map((user) => user?.habboName)
          .join("\n");

        await dmChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${targetMedal?.name}`)
              .addFields([
                {
                  name: "ID",
                  value: medal.discordId,
                },
                {
                  name: "Tipo",
                  value: `${medal.index}`,
                  inline: true,
                },
                {
                  name: "Nível",
                  value: `${medal.level}`,
                  inline: true,
                },
                {
                  name: "Requisito",
                  value: `${medal.required}`,
                  inline: false,
                },
                {
                  name: "Descrição",
                  value: `${medal.description}`,
                },
                {
                  name: "Colaboradores que possuem",
                  value:
                    usersWithMedal || usersWithMedal.length > 1
                      ? usersWithMedal
                      : "Ainda não há colaboradores.",
                },
              ])
              .setColor(EmbedColors.LalaRed),
          ],
        });
      }

      await dmChannel.send({
        content: "**FIM DA LISTA DE MEDALHAS**",
      });
    } else if (listOptions.result === "one") {
      await interaction.editReply({
        content: "Carregando...",
        embeds: [],
        components: [],
      });

      const medalChoices = (
        await Promise.all(
          values(medalsDB).map(
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
          throw error;
        }
      }

      const existingMedal = await this.container.prisma.medals.findUnique({
        where: {
          discordId: targetMedalId,
        },
      });

      if (!existingMedal) {
        await interaction.editReply({
          content: `O Id escolhido não existe no banco de dados. <@&${targetMedalId}>`,
          components: [],
          embeds: [],
        });

        return;
      }

      const targetMedal = await guild.roles.fetch(targetMedalId);

      const usersWithMedalDB = await Promise.all(
        existingMedal.users.map(async (userDiscordId) => {
          return await this.container.prisma.user.findUnique({
            where: { discordId: userDiscordId },
            select: {
              habboName: true,
            },
          });
        })
      );

      const usersWithMedal = usersWithMedalDB
        .map((user) => user?.habboName)
        .join("\n");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${targetMedal?.name}`)
            .addFields([
              {
                name: "ID",
                value: existingMedal.discordId,
              },
              {
                name: "Tipo",
                value: `${existingMedal.index}`,
                inline: true,
              },
              {
                name: "Nível",
                value: `${existingMedal.level}`,
                inline: true,
              },
              {
                name: "Requisito",
                value: `${existingMedal.required}`,
                inline: false,
              },
              {
                name: "Descrição",
                value: `${existingMedal.description}`,
              },
              {
                name: "Colaboradores que possuem",
                value:
                  usersWithMedal || usersWithMedal.length > 1
                    ? usersWithMedal
                    : "Ainda não há colaboradores.",
              },
            ])
            .setColor(EmbedColors.LalaRed),
        ],
        components: [],
        content: "",
      });
    }
  }
}
