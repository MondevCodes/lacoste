import {
  InteractionHandler,
  InteractionHandlerTypes,
  Result,
} from "@sapphire/framework";

import {
  ButtonStyle,
  EmbedBuilder,
  TextInputStyle,
  TextInputBuilder,
  ButtonInteraction,
  GuildMemberRoleManager,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

import { values } from "remeda";
import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

type InGuild = "cached" | "raw";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class MedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match("LCST::MedalInteractionHandler")) {
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
    interaction: any,
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
          .setPlaceholder(`Página ${page + 1}/${totalPages}`)
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
      content: "Selecione a medalha que deseja visualizar",
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

  public override async run(interaction: ButtonInteraction<InGuild>) {
    const { interaction: interactionFromModal, result } =
      await this.container.utilities.inquirer.awaitModal(interaction, {
        title: "Entregar Medalha",
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId("target")
            .setLabel("Medalhista")
            .setPlaceholder("Informe o Habbo (Nick).")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),

          new TextInputBuilder()
            .setCustomId("additional")
            .setLabel("Deseja adicionar alguma observação?")
            .setPlaceholder("Se desejar, adicione informações extras aqui.")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ],
      });

    const inferredTargetResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(result.target)
    );

    if (inferredTargetResult.isErr()) {
      await interactionFromModal.editReply({
        content: "||P93N|| Houve um erro inesperado, contate o desenvolvedor.",
      });

      return;
    }

    const { member: targetMember, habbo: targetHabbo } =
      inferredTargetResult.unwrapOr({ member: undefined, habbo: undefined });

    if (!targetHabbo) {
      await interactionFromModal.editReply({
        content:
          "Não foi possivel encontrar o usuário no Habbo, verifique se o mesmo está com a conta pública no jogo.",
      });

      return;
    }

    if (!targetMember) {
      const isHabboTarget = result.target.startsWith("@");

      await interactionFromModal.editReply({
        content: !isHabboTarget
          ? "||P108N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o ID do Discord, ele(a) deve estar no servidor)."
          : "||P107N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o nickname do Habbo, ele(a) deve estar registrado(a) com `vincular`).",
      });

      return;
    }

    const currentTargetJob = this.#inferHighestJobRole(targetMember.roles);

    if (!currentTargetJob) {
      await interactionFromModal.editReply({
        content:
          "||WP120|| Não foi possível encontrar o atual cargo do usuário, você tem certeza que ele(a) possui um cargo hierárquico? Se não, contate o desenvolvedor.",
      });

      return;
    }

    // Next Job
    // Next Job

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const allMedals = await this.container.prisma.medals.findMany();

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

    let currentPage = 0;
    let targetMedalId: string | null = null;

    while (!targetMedalId) {
      try {
        targetMedalId = await this.createMedalSelectMenu(
          interactionFromModal,
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

    const hasMedal = targetMember.roles.cache.has(targetMedalId);

    if (hasMedal) {
      await interactionFromModal.editReply({
        content: `O colaborador já possuí a medalha <@&${targetMedalId}>.`,
      });

      return;
    }

    // Authorized
    // Authorized

    // Infer Roles
    // Infer Roles

    // Check Cooldown
    // Check Cooldown

    const existingUser = await this.container.prisma.user.findUnique({
      where: {
        discordId: targetMember.user.id,
      },
      select: {
        id: true,
        habboName: true,
      },
    });

    if (!existingUser) {
      await interactionFromModal.editReply({
        content:
          "Colaborador não encontrado na base de dados, verifique se o nome está correto ou **vincule-o**",
      });

      return;
    }

    // Confirmation
    // Confirmation

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
                `Entregar <@&${targetMedalId}> para <@${targetMember.user.id}>?`
              )
              .setThumbnail(
                `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
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
            "[MedalInteractionHandler] Couldn't delete reply."
          )
        );

      return;
    }

    // Promotion
    // Promotion

    const targetMedal = await guild.roles.fetch(targetMedalId);

    const targetMedalDB = await this.container.prisma.medals.findUnique({
      where: {
        discordId: targetMedalId,
      },
    });

    if (!targetMedal || !targetMedalDB) {
      await interactionFromModal.editReply({
        content: "||WP121|| Ocorreu um erro, contate o desenvolvedor.",
      });

      return;
    }

    const previousMedalDB = await this.container.prisma.medals.findFirst({
      where: {
        AND: [
          {
            index: targetMedalDB.index,
            level: targetMedalDB.level - 1,
          },
        ],
      },
    });

    // const previousMedal = Object.values(ENVIRONMENT.MEDALS).find(
    //   (medal) =>
    //     medal.index === targetMedalEnvironment?.index &&
    //     medal.level === targetMedalEnvironment?.level - 1
    // );

    if (previousMedalDB) {
      await guild.members
        .removeRole({
          user: targetMember.id,
          role: previousMedalDB.discordId,
        })
        .catch(() =>
          this.container.logger.error(
            "[MedalInteractionHandler#run] Error to remove previous Medal level"
          )
        );

      const newUserListRemoved = previousMedalDB.users.filter(
        (userDiscordId) => userDiscordId !== targetMember.user.id
      );

      await this.container.prisma.medals.update({
        where: {
          discordId: previousMedalDB.discordId,
        },
        data: {
          users: newUserListRemoved,
        },
      });

      await guild.members
        .addRole({
          user: targetMember.id,
          role: targetMedal,
        })
        .catch(() =>
          this.container.logger.error(
            "[MedalInteractionHandler#run] Error to add target Medal"
          )
        );

      await this.container.prisma.medals.update({
        where: {
          discordId: targetMedalDB.discordId,
        },
        data: {
          users: { push: targetMember.user.id },
        },
      });
    } else {
      await guild.members
        .addRole({
          user: targetMember.id,
          role: targetMedal,
        })
        .catch(() =>
          this.container.logger.error(
            "[MedalInteractionHandler#run] Error to add target Medal"
          )
        );

      await this.container.prisma.medals.update({
        where: {
          discordId: targetMedalDB.discordId,
        },
        data: {
          users: { push: targetMember.user.id },
        },
      });
    }

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.GERAL
    );

    if (notificationChannel?.isTextBased()) {
      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Medalha de Honra")
            .setImage(
              "https://cdn.discordapp.com/attachments/1266124737277595729/1293707875901898764/lacmedalha_4.gif?ex=67085ad9&is=67070959&hm=b2f63238f29f3a5fde83af5319bf1fecf8e196e3eaf3e0289203ba7055724fee&"
            )
            .setDescription(
              `Olá, nosso colaborador **${
                existingUser.habboName ?? targetHabbo.name
              }** acaba de ser agraciado com uma medalha.\nVamos celebrar e deseja-lo parabéns pelo feito.`
            )
            .addFields([
              {
                name: "Medalha",
                value: targetMedal.name,
              },
              {
                name: ":trophy:",
                value: `${targetMedalDB?.description}`,
                inline: true,
              },
              {
                name: ":white_check_mark: Requisito",
                value: `${targetMedalDB?.required}`,
                inline: true,
              },
              {
                name: "📗 Cargo do Medalhista",
                value: currentTargetJob.toString(),
                inline: false,
              },
              {
                name: "🗒️ Observação",
                value:
                  result.additional.length > 0
                    ? result.additional
                    : "Nenhuma observação foi adicionada.",
              },
              {
                name: ":people_hugging: Entregue por",
                value: "Sistema Lacoste",
              },
            ])
            .setColor(EmbedColors.LalaRed)
            .setThumbnail(
              `https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`
            ),
        ],
      });

      await notificationChannel.send({
        content: `@everyone 🎖️ <@${targetMember.id}>`,
      });
    }

    await interactionFromModal.editReply({
      content: "✅ Operação concluída.",
      embeds: [],
      components: [],
    });
  }

  #inferHighestJobRole(roles: GuildMemberRoleManager) {
    const jobRoles = roles.cache.filter((role) =>
      Object.values(ENVIRONMENT.JOBS_ROLES).some((r) => r.id === role.id)
    );

    if (jobRoles.size === 0) return null;

    return jobRoles.reduce((highest, current) => {
      const currentIndex =
        Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === current.id)
          ?.index ?? 0;

      const highestIndex =
        Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === highest.id)
          ?.index ?? 0;

      if (!currentIndex || !highestIndex) {
        return current;
      }

      return currentIndex > highestIndex ? current : highest;
    });
  }
}
