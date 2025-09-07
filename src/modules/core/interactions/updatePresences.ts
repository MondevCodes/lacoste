import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import {
  ButtonInteraction,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class UpdatePresenceInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (
      interaction.customId !== FormIds.adicionarPresença &&
      interaction.customId !== FormIds.removerPresença
    ) {
      return this.none();
    }

    const userTag = interaction.user.tag;

    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[UpdatePresenceInteractionHandler#parse] ${userTag} tried to perform an action in a DM.`
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

    const isAuthorizedCommittee = roles.cache.has(
      ENVIRONMENT.COMMITTEES_ROLES.LÍDER_ORGANIZACIONAL.id
    );

    const isAuthorizedSector =
      this.container.utilities.discord.hasPermissionByRole({
        checkFor: "FUNDAÇÃO",
        category: "SECTOR",
        roles,
      });

    if (!isAuthorizedSector && !isAuthorizedCommittee) {
      await interaction.reply({
        content: `⛔ **Não autorizado**. Você precisa ter o cargo de <@&788612423363330085> ou <@&1008077046955651193> para acessar as funções de editar Presenças.`,
        ephemeral: true,
      });
    }

    return isAuthorizedSector || isAuthorizedCommittee
      ? this.some()
      : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const { interaction: interactionFromModal, result: modalResult } =
      await this.container.utilities.inquirer.awaitModal<
        "Target" | "TotalAmount" | "AmountCG"
      >(interaction, {
        title: `Editar Presenças [Configuração]`,
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId("Target")
            .setLabel("Membro")
            .setPlaceholder("Informe o Habbo (Nick)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("TotalAmount")
            .setLabel(
              `Quantidade de Presenças Totais ${
                interaction.customId === FormIds.adicionarPresença
                  ? `Adicionadas`
                  : `Removidas`
              }`
            )
            .setPlaceholder(
              `Presenças Totais que deseja ${
                interaction.customId === FormIds.adicionarPresença
                  ? `Adicionar`
                  : `Remover`
              } (Ex.: 1)`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false),

          new TextInputBuilder()
            .setCustomId("AmountCG")
            .setLabel(
              `Quantidade de Presenças C.G ${
                interaction.customId === FormIds.adicionarPresença
                  ? `Adicionadas`
                  : `Removidas`
              }`
            )
            .setPlaceholder(
              `Presenças C.G que deseja ${
                interaction.customId === FormIds.adicionarPresença
                  ? `Adicionar`
                  : `Remover`
              } (Ex.: 1)`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ],
      });

    if (
      (!Number(modalResult.TotalAmount) && !Number(modalResult.AmountCG)) ||
      isNaN(Number(modalResult.TotalAmount)) ||
      isNaN(Number(modalResult.AmountCG))
    ) {
      return await interactionFromModal.editReply({
        content: `❌ A quantidade de presenças ${
          interaction.customId === FormIds.adicionarPresença
            ? "adicionadas"
            : "removidas"
        } está incorreta. Verifique se não está inserindo **0** em **ambos** os campos ou algum carácter inválido!`,
      });
    }

    const rawName = modalResult.Target.trim().replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

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
        reportsHistory: 1,
        reportsHistoryCG: 1,
      },
      limit: 1,
    });

    if (!resultRaw.cursor?.firstBatch.length) {
      return await interactionFromModal.editReply({
        content: `❌ O usuário **${rawName}** não foi encontrado. Verifique se o nome está correto e tente novamente!`,
      });
    }

    const userOld = resultRaw.cursor?.firstBatch[0];

    const countOldTotalPresences = userOld.reportsHistory?.length ?? 0;
    const countOldCGPresences = userOld.reportsHistoryCG?.length ?? 0;

    let updatedCountTotalPresences: number = null;
    let updatedCountCGPresences: number = null;

    const authorDB = await this.container.prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { habboName: true },
    });

    if (interaction.customId === FormIds.adicionarPresença) {
      this.container.logger.info(
        `[UpdatePresenceInteractionHandler#run] Update Data Presence: Manual Add Presence triggered by ${authorDB.habboName}.`
      );

      const fixedDate = new Date(Date.UTC(2012, 11, 12, 12, 12, 12, 121));

      const totalCount = Number(modalResult.TotalAmount);
      const cgCount = Number(modalResult.AmountCG);

      let updateTotalDates: Date[] = null;
      let updateCGDates: Date[] = null;

      if (cgCount) {
        updateCGDates = Array.from(
          { length: cgCount },
          () => new Date(fixedDate)
        );
      }
      if (totalCount) {
        updateTotalDates = Array.from(
          { length: totalCount },
          () => new Date(fixedDate)
        );
      }

      const targetDB = await this.container.prisma.user.update({
        where: { id: userOld._id.$oid },
        data: {
          ...(updateTotalDates && {
            reportsHistory: { push: updateTotalDates },
          }),
          ...(updateCGDates && {
            reportsHistoryCG: { push: updateCGDates },
          }),
        },
        select: { reportsHistory: true, reportsHistoryCG: true },
      });

      updatedCountTotalPresences = targetDB.reportsHistory?.length ?? 0;
      updatedCountCGPresences = targetDB.reportsHistoryCG?.length ?? 0;
    }

    if (interaction.customId === FormIds.removerPresença) {
      this.container.logger.info(
        `[UpdatePresenceInteractionHandler#run] Update Data Presence: Manual Remove Presence triggered by ${authorDB.habboName}.`
      );

      const totalToRemove = Number(modalResult.TotalAmount);
      const cgToRemove = Number(modalResult.AmountCG);

      const oldTotalPresences: Date[] =
        (userOld.reportsHistory ?? []).map(
          (date: { $date: string }) => new Date(date.$date)
        ) ?? [];
      const oldCGPresences: Date[] =
        (userOld.reportsHistoryCG ?? []).map(
          (date: { $date: string }) => new Date(date.$date)
        ) ?? [];

      if (!oldCGPresences.length && !oldTotalPresences.length) {
        return await interactionFromModal.editReply({
          content: `❌ O usuário **${rawName}** não possui nenhuma presença para ser removida.`,
        });
      }

      let sortedTotalPresences: Date[] = null;
      let sortedCGPresences: Date[] = null;
      let updatedTotalPresences: Date[] = null;
      let updatedCGPresences: Date[] = null;

      if (cgToRemove) {
        sortedCGPresences = oldCGPresences
          .map((date) => new Date(date))
          .sort((a, b) => a.getTime() - b.getTime());

        updatedCGPresences = sortedCGPresences.slice(cgToRemove);
      }
      if (totalToRemove) {
        sortedTotalPresences = oldTotalPresences
          .map((date) => new Date(date))
          .sort((a, b) => a.getTime() - b.getTime());

        updatedTotalPresences = sortedTotalPresences.slice(totalToRemove);
      }

      const targetDB = await this.container.prisma.user.update({
        where: { id: userOld._id.$oid },
        data: {
          ...(updatedTotalPresences && {
            reportsHistory: updatedTotalPresences,
          }),
          ...(updatedCGPresences && {
            reportsHistoryCG: updatedCGPresences,
          }),
        },
        select: { reportsHistory: true, reportsHistoryCG: true },
      });

      updatedCountTotalPresences = targetDB.reportsHistory?.length ?? 0;
      updatedCountCGPresences = targetDB.reportsHistoryCG?.length ?? 0;
    }

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const logUpdatedPresenceChannel = await guild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.LOGS
    );

    if (!logUpdatedPresenceChannel?.isTextBased()) {
      throw new Error(
        "Updated Presence channel log not found or not a text channel."
      );
    }

    const logMessage = await logUpdatedPresenceChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Alteração Manual de Presenças 📑 \n")
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .addFields([
            {
              name: "👤 Autor",
              value: `${authorDB.habboName ?? `@${interaction.user.tag}`}`,
              inline: true,
            },
            {
              name: "📇 Usuário Modificado",
              value: `${userOld.habboName ?? `@${userOld.discordId}`}`,
              inline: true,
            },
            {
              name: "\u200B",
              value: "\u200B",
              inline: true,
            },
            {
              name: `${
                interaction.customId === FormIds.adicionarPresença
                  ? "➕ Adicionado"
                  : "➖ Removido"
              } Presenças Totais`,
              value: `${
                interaction.customId === FormIds.adicionarPresença
                  ? updatedCountTotalPresences - countOldTotalPresences
                  : countOldTotalPresences - updatedCountTotalPresences
              }`,
              inline: true,
            },
            {
              name: "🗳️ 🔄 Presenças Totais (Anterior)",
              value: `${countOldTotalPresences}`,
              inline: true,
            },
            {
              name: "🗳️ ✅ Presenças Totais (Atualizado)",
              value: `${
                updatedCountTotalPresences === countOldTotalPresences
                  ? "*Sem alterações*"
                  : updatedCountTotalPresences
              }`,
              inline: true,
            },
            {
              name: `${
                interaction.customId === FormIds.adicionarPresença
                  ? "➕ Adicionado"
                  : "➖ Removido"
              } Presenças C.G`,
              value: `${
                interaction.customId === FormIds.adicionarPresença
                  ? updatedCountCGPresences - countOldCGPresences
                  : countOldCGPresences - updatedCountCGPresences
              }`,
              inline: true,
            },
            {
              name: "🗳️ 🔄 Presenças C.G (Anterior)",
              value: `${countOldCGPresences}`,
              inline: true,
            },
            {
              name: "🗳️ ✅ Presenças C.G (Atualizado)",
              value: `${
                updatedCountCGPresences === countOldCGPresences
                  ? "*Sem alterações*"
                  : updatedCountCGPresences
              }`,
              inline: true,
            },
          ])
          .setColor(
            interaction.customId === FormIds.adicionarPresença
              ? EmbedColors.AddAmount
              : EmbedColors.RemoveAmount
          ),
      ],
    });

    const logMessageLink = `https://discord.com/channels/${logMessage.guildId}/${logMessage.channelId}/${logMessage.id}`;

    return await interactionFromModal.editReply({
      content: `🗳️ ✅ Presenças de ***${
        userOld.habboName
      }*** atualizadas com sucesso. \n \nQuantidade **${
        interaction.customId === FormIds.adicionarPresença
          ? "Adicionada"
          : "Removida"
      }:** \n - Presenças *Totais*: **${
        interaction.customId === FormIds.adicionarPresença
          ? updatedCountTotalPresences - countOldTotalPresences
          : countOldTotalPresences - updatedCountTotalPresences
      }**. \n - Presenças *C.G*: **${
        interaction.customId === FormIds.adicionarPresença
          ? updatedCountCGPresences - countOldCGPresences
          : countOldCGPresences - updatedCountCGPresences
      }**. \n\n*Para mais detalhes, confira:* ${logMessageLink}`,
    });
  }
}
