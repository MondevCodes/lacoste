import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { EmbedBuilder, ButtonInteraction } from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";

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

  public override async run(interaction: ButtonInteraction<InGuild>) {
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const medalsDB = await this.container.prisma.medals.findMany();

    const dmChannel =
      interaction.user.dmChannel || (await interaction.user.createDM());

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

      await interaction.reply({
        content: "Te mandei a lista na sua DM do Discord ✅",
        ephemeral: true,
      });

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
  }
}
