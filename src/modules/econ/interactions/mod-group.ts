import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import {
  ButtonStyle,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { ENVIRONMENT } from "$lib/env";

import type { ButtonInteraction } from "discord.js";
import { EmbedColors } from "$lib/constants/discord";

export type Action = "Add" | "Del";

export const BASE_BUTTON_ID = "LCST::ModGroupInteractionHandler";
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "CAM",
  minimumFractionDigits: 0,
});

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
export class ModGroupInteractionHandler extends InteractionHandler {
  async #isAuthorized(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) {
      this.container.logger.warn(
        `[ModGroupInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`
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
        `[ModGroupInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      return;
    }

    const { result, interaction: i } =
      await this.container.utilities.inquirer.awaitModal<"Targets" | "Amount">(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
              .setLabel("Usuários")
              .setCustomId("Targets")
              .setPlaceholder("Ex. Usuário (Habbo)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setCustomId("Amount")
              .setLabel("Quantidade de Câmbios")
              .setPlaceholder("A quantia de câmbios a ser adicionada")
              .setStyle(TextInputStyle.Short)
              .setRequired(false),
          ],
          title:
            data.action === "Add"
              ? "Adicionar Saldo Grupo"
              : "Remover Saldo Grupo",
          listenInteraction: true,
        }
      );

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    // const [targetRoleId] =
    // 	await this.container.utilities.inquirer.awaitSelectMenu(i, {
    // 		choices: await Promise.all(
    // 			Object.values(ENVIRONMENT.JOBS_ROLES).map(async (x) => ({
    // 				id: x.id,
    // 				label:
    // 					guild.roles.cache.get(x.id)?.name ??
    // 					(await guild.roles.fetch(x.id))?.name ??
    // 					"Unknown",
    // 			})),
    // 		),
    // 		placeholder: "Selecionar",
    // 		question: "Escolha o cargo no qual deseja.",
    // 	});

    // if (!targetRoleId) {
    // 	this.container.logger.warn(
    // 		`[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
    // 	);

    // 	await i.editReply({
    // 		content: "Nenhum cargo selecionado.",
    // 	});

    // 	return;
    // }

    const rawAmount = Number(result.Amount);
    const amount = rawAmount > 0 ? rawAmount : 0;

    const targets = result.Targets.split(",")
      .filter((x) => x.length > 0)
      .map((x) => x.trim());

    if (targets.length < 1) {
      await i.editReply({
        content: "Nenhum usuário informado ou todos estão inválidos.",
      });

      return;
    }

    if (Number.isNaN(amount) || amount < 0) {
      this.container.logger.warn(
        `[HireInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`
      );

      await i.editReply({
        content: `O salário deste cargo (${amount}) é inválido, contate o desenvolvedor.`,
      });

      return;
    }

    const members: { id: string; habboName: string }[] = [];

    for await (const target of targets) {
      // const targetMember = (
      //   await this.container.utilities.habbo.getProfile(target)
      // ).unwrapOr(undefined);

      // if (!targetMember) {
      // 	// await i.editReply({
      // 	// 	content: "Não foi possível encontrar o usuário informado.",
      // 	// 	components: [],
      // 	// 	embeds: [],
      // 	// });

      // 	continue;
      // }

      const rawName = target.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

      if (!resultRaw.cursor?.firstBatch.length) {
        this.container.logger.warn(
          "[HireInteractionHandler#run] Author or target user was not found in database."
        );

        continue;
      }

      this.container.logger.info(
        `[ModGroupInteractionHandler#run] Adding ${amount} to ${target} in group.`
      );

      members.push({
        id: resultRaw.cursor?.firstBatch[0]._id?.$oid,
        habboName: resultRaw.cursor?.firstBatch[0].habboName,
      });
    }

    // const disqualifiedMembers = members.filter(
    // 	(x) => !x.roles.cache.has(targetRoleId),
    // );

    // members = members.filter((x) => x.roles.cache.has(targetRoleId));

    if (members.length < 1) {
      await i.editReply({
        content: "Nenhum usuário encontrado no cargo informado.",
      });

      return;
    }

    const confirmationEmbed = new EmbedBuilder()
      .setTitle("Confirmação")
      .setDescription(
        `Tem certeza que deseja executar a ação de ${data.action} para ${
          members.length
        } ${members.length === 1 ? "usuário" : "usuários"}?`
      )
      .addFields([
        {
          name: "Usuários",
          value: `- ${members.map((x) => x.habboName.toString()).join("\n- ")}`,
        },
      ])
      .setFooter({
        text: MONETARY_INTL.format(amount),
      })
      .setColor(EmbedColors.Default);

    // if (disqualifiedMembers.length > 0) {
    // 	confirmationEmbed.addFields([
    // 		{
    // 			name: "Usuários Desqualificados",
    // 			value: `- ${disqualifiedMembers
    // 				.map((x) => `~~${x.user.toString()}~~`)
    // 				.join("\n- ")}`,
    // 		},
    // 	]);
    // }

    const { result: isConfirmed } =
      await this.container.utilities.inquirer.awaitButtons(i, {
        question: { embeds: [confirmationEmbed] },
        choices: [
          {
            id: "True" as const,
            style: ButtonStyle.Success,
            label: "Sim",
          },
          {
            id: "False" as const,
            style: ButtonStyle.Danger,
            label: "Não",
          },
        ],
      });

    if (!isConfirmed) {
      await i.editReply({
        content: "Operação cancelada pelo usuário.",
        components: [],
        embeds: [],
      });

      return;
    }

    const fields: string[] = [];

    for (const member of members) {
      const {
        _sum: { amount: totalAmount },
      } = await this.container.prisma.transaction.aggregate({
        where: { user: { id: member.id } },
        _sum: { amount: true },
      });

      fields.push(
        `- ${member.habboName.toString()}: \`\`${MONETARY_INTL.format(
          totalAmount ?? 0
        )}\`\` -> \`\`${MONETARY_INTL.format(
          data.action === "Add"
            ? (totalAmount ?? 0) + amount
            : (totalAmount ?? 0) - amount
        )}\`\``
      );

      await this.container.prisma.user.update({
        where: {
          id: member.id,
        },
        data: {
          ReceivedTransactions: {
            create: {
              amount: data.action === "Add" ? amount : -Math.abs(amount),
              author: { connect: { discordId: interaction.user.id } },
              reason: "Adicionado em grupo",
            },
          },
        },
      });
    }

    await i.editReply({
      content: `Operação concluída com sucesso, todos os ${targets.length} ${
        targets.length === 1 ? "usuário" : "usuários"
      } ${
        data.action === "Add" ? "receberão" : "perderão"
      } o valor de ${amount}.`,
      components: [],
      embeds: [],
    });

    const notificationChannel = await guild.channels.fetch(
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
          .setTitle("Alteração de Saldo (Grupo)")
          .setDescription(
            data.action === "Add"
              ? `Adicionado ${amount} Câmbios em ${targets.length} ${
                  targets.length === 1 ? "usuário" : "usuários"
                }`
              : `Removido ${amount} Câmbios em ${targets.length} ${
                  targets.length === 1 ? "usuário" : "usuários"
                }`
          )
          .setFields([
            {
              name: "Usuários",
              value: fields.join("\n"),
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
