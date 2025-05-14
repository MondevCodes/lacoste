import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import { EmbedBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

import type { ButtonInteraction } from "discord.js";
import { MONETARY_INTL } from "../commands/balance";

export type Action = "Add" | "Del";

export const BASE_BUTTON_ID = "LCST::ModIndividualInteractionHandler";
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

/** @internal @see {@link decodeButtonId} */
export function encodeButtonId(action: Action) {
  return `${BASE_BUTTON_ID}/${action}`;
}

/** @internal @see {@link encodeButtonId} */
export function decodeButtonId(id: string): Action {
  return id.replace(`${BASE_BUTTON_ID}/`, "") as Action;
}

type ParsedData = { action: Action };

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModIndividualInteractionHandler extends InteractionHandler {
  async #isAuthorized(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) {
      this.container.logger.warn(
        `[ModIndividualInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return false;
    }

    const { roles } =
      interaction.member ??
      (await interaction.guild.members.fetch(interaction.user.id));

    return this.container.utilities.discord.hasPermissionByRole({
      checkFor: "FUNDAÇÃO",
      category: "SECTOR",
      roles,
    });
  }

  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();
    if (!(await this.#isAuthorized(interaction))) return this.none();

    return this.some({ action: decodeButtonId(interaction.customId) });
  }

  public override async run(interaction: ButtonInteraction, data: ParsedData) {
    if (!interaction.inGuild()) {
      this.container.logger.warn(
        `[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return;
    }

    const { result, interaction: i } =
      await this.container.utilities.inquirer.awaitModal<"Target" | "Amount">(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
              .setCustomId("Target")
              .setLabel("Membro")
              .setPlaceholder("Informe o Habbo (Nick).")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId("Amount")
              .setLabel("Quantidade de Câmbios")
              .setPlaceholder("A quantia de câmbios a ser adicionada")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ],
          title:
            data.action === "Add"
              ? "Adicionar Saldo Individual"
              : "Remover Saldo Individual",
          listenInteraction: true,
        }
      );

    const amount = Number(result.Amount);

    if (Number.isNaN(amount)) {
      this.container.logger.warn(
        `[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      await interaction.reply({
        ephemeral: true,
        content: "Quantia inválida, tente novamente apenas números",
      });
    }

    const cachedGuild =
      interaction.guild ??
      (await this.container.client.guilds.fetch(interaction.guildId));

    const targetHabbo = (
      await this.container.utilities.habbo.getProfile(result.Target)
    ).unwrapOr(undefined);

    // if (!targetHabbo) {
    //   await i.editReply({
    //     content:
    //       "Não foi possível encontrar o usuário informado no Habbo, verifique se o mesmo está com o perfil público no jogo.",
    //   });

    //   return;
    // }

    const rawName = result.Target.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const resultRaw: any = await this.container.prisma.$runCommandRaw({
      find: "User",
      filter: {
        habboName: {
          $regex: `^${rawName}$`,
          $options: "i",
        },
      },
      limit: 1,
    });

    const authorUser = await this.container.prisma.user.findUnique({
      where: {
        discordId: interaction.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!resultRaw.cursor?.firstBatch.length || !authorUser) {
      this.container.logger.warn(
        "[HireInteractionHandler#run] Author or target user was not found in database."
      );

      await i.editReply({
        content:
          "Usuário (você ou o perfil do membro) não encontrado no banco de dados, use `vincular`.",
      });

      return;
    }

    const rawTargetDB = resultRaw.cursor.firstBatch[0];

    const targetUser = {
      ...rawTargetDB,
      _id: rawTargetDB._id?.$oid || rawTargetDB._id,
      id: rawTargetDB._id?.$oid || rawTargetDB._id,
      createdAt: rawTargetDB.createdAt?.$date
        ? new Date(rawTargetDB.createdAt.$date)
        : null,
      updatedAt: rawTargetDB.updatedAt?.$date
        ? new Date(rawTargetDB.updatedAt.$date)
        : null,
      latestPromotionDate: rawTargetDB.latestPromotionDate?.$date
        ? new Date(rawTargetDB.latestPromotionDate.$date)
        : null,
    };

    const {
      _sum: { amount: totalAmount },
    } = await this.container.prisma.transaction.aggregate({
      where: { user: { id: targetUser.id } },
      _sum: { amount: true },
    });

    const newTotalAmount =
      data.action === "Add"
        ? (totalAmount ?? 0) + amount
        : (totalAmount ?? 0) - Math.abs(amount);

    await this.container.prisma.user.update({
      where: {
        id: targetUser.id,
      },
      data: {
        ReceivedTransactions: {
          create: {
            amount: data.action === "Add" ? amount : -Math.abs(amount),
            authorId: authorUser.id,
            reason: "Adicionado individualmente",
          },
        },
      },
    });

    await i.editReply({
      content: `${
        data.action === "Add" ? "Adicionado" : "Removido"
      } **${amount}** Câmbios ao perfil de ${
        targetUser?.habboName || targetHabbo?.name
      }!`,
    });

    const notificationChannel = await cachedGuild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.CMB_LOGS
    );

    if (!notificationChannel?.isTextBased()) {
      throw new Error("Can't send message to non-text channel.");
    }

    await notificationChannel.send({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTitle("Alteração de Saldo (Individual)")
          .setThumbnail(
            targetHabbo
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`
              : null
          )
          .setDescription(
            `**${amount} Câmbios** ${
              data.action === "Add" ? "adicionado" : "removido"
            } individualmente por ${interaction.user} para ${
              targetUser?.habboName ?? targetHabbo?.name
            }`
          )
          .addFields([
            {
              name: "Saldo Anterior",
              value: MONETARY_INTL.format(totalAmount ?? 0),
            },
            {
              name: "Saldo Atual",
              value: MONETARY_INTL.format(newTotalAmount),
            },
          ])
          .setColor(
            data.action === "Add"
              ? EmbedColors.AddAmount
              : EmbedColors.RemoveAmount
          ),
      ],
    });
  }
}
