import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  MessageFlags,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { MarkdownCharactersRegex } from "$lib/constants/regexes";

enum FeedbackInputIds {
  Target = "Target",
  Description = "Description",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class SuggestionFormInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) {
      throw new Error("Cannot check permissions outside of a guild.");
    }

    return interaction.customId === FormIds.Sugestão
      ? this.some()
      : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const { result, interaction: interactionFromModal } =
      await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
              .setLabel("Autor da Sugestão")
              .setPlaceholder(
                "Informe ID do Discord (@Nick) ou do Habbo (Nick)."
              )
              .setCustomId(FeedbackInputIds.Target)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Descrição")
              .setPlaceholder("Ex.: Novos recursos do servidor.")
              .setCustomId(FeedbackInputIds.Description)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ],
          listenInteraction: true,
          title: "Sugestão",
        }
      );

    this.container.logger.info(
      `Inicio do envio da Sugestão de ${result.Target} para análise por ${interaction.user.tag}. 📩⌛`
    );

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

    const rawName = result.Target.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const resultRaw: any = await this.container.prisma.$runCommandRaw({
      find: "User",
      filter: {
        habboName: {
          $regex: `^${rawName}$`,
          $options: "i",
        },
      },
      projection: {
        _id: 1,
        discordId: 1,
        habboName: 1,
        habboId: 1,
      },
      limit: 1,
    });

    if (!resultRaw.cursor?.firstBatch.length) {
      await interaction.reply({
        content: `⚠️  O usuário ${result.Target} **não está vinculado** na nossa base de dados, verifique o nome ou **vincule-o**.`,
        flags: MessageFlags.Ephemeral,
      });
      this.container.logger.error(
        `Tentativa de envio de Sugestão de ${result.Target} por ${interaction.user.tag} falhou em encontrar o usuário no banco de dados. 📩❌`
      );
      return;
    }

    const rawTargetDB = resultRaw.cursor.firstBatch[0];

    const targetDB = {
      ...rawTargetDB,
      _id: rawTargetDB._id?.$oid || rawTargetDB._id,
      id: rawTargetDB._id?.$oid || rawTargetDB._id,
    };

    const onlyHabbo = (
      await this.container.utilities.habbo.getProfile(targetDB.habboId)
    ).unwrapOr(undefined);

    const targetDiscord = await interaction.guild.members.fetch(
      targetDB.discordId
    );
    if (!targetDiscord) {
      this.container.logger.error(
        `Tentativa de envio de Sugestão de ${result.Target} por ${interaction.user.tag} falhou em encontrar o usuário no banco de dados do Discord. 📩❌`
      );
      await interaction.reply({
        content: `⚠️  Usuário alvo da indicação ${result.Target} não foi encontrado na base de dados do Discord.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (!interactionFromModal.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }

    const targetHighestSectorId =
      this.container.utilities.discord.inferHighestJobRole(
        targetDiscord.roles.cache.map((r) => r.id)
      );

    const targetHighestSector = targetHighestSectorId
      ? await guild.roles.fetch(targetHighestSectorId)
      : null;

    const embed = new EmbedBuilder()
      .setTitle("Sugestão")
      .setThumbnail(
        onlyHabbo
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${onlyHabbo?.figureString}&size=b`
          : null
      )
      .addFields([
        {
          name: "Autor(a)",
          value: `${
            onlyHabbo?.name.replaceAll(MarkdownCharactersRegex, "\\$&") ??
            result.Target
          } // ${targetDiscord.toString()}`,
        },
        {
          name: "Diretor(a)",
          value: interaction.user.toString(),
        },
        {
          name: "Cargo",
          value: targetHighestSector?.name ?? "N/D",
        },
        {
          name: "Descrição",
          value: result.Description,
        },
      ])
      .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setColor(EmbedColors.Alert);

    const channel = await guild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_SUGGESTION
    );

    if (channel === null || !channel.isTextBased()) {
      throw new Error(
        "Form evaluation channel not found or not a text channel."
      );
    }

    await channel.send({
      embeds: [embed],
    });

    this.container.logger.info(
      `Sugestão de ${result.Target} enviada para análise por ${interaction.user.tag}. 📩✅`
    );

    await interactionFromModal.deleteReply();
  }
}
