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

    const medalChoices = await Promise.all(
      values(ENVIRONMENT.MEDALS).map(
        async (value) =>
          value.id &&
          (guild.roles.cache.get(value.id) ??
            (await guild.roles.fetch(value.id)))
      )
    );

    const [targetMedalId] =
      await this.container.utilities.inquirer.awaitSelectMenu(
        interactionFromModal,
        {
          choices: [
            ...medalChoices.filter(Boolean).map((medal) => ({
              id: medal.id,
              label: medal.name,
            })),
          ],
          placeholder: "Selecionar",
          question: "Selecione a medalha que deseja entregar.",
        }
      );

    const hasMedal = targetMember.roles.cache.has(targetMedalId);

    if (hasMedal) {
      await interactionFromModal.editReply({
        content: `O colaborador já possuí a medalha <@&${targetMedalId}>.`,
      });

      return;
    }

    const targetMedalEnvironment = Object.values(ENVIRONMENT.MEDALS).find(
      (medal) => medal.id === targetMedalId
    );

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

    const authorDB = await this.container.prisma.user.findUnique({
      where: {
        discordId: interaction.user.id,
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

    if (!targetMedal || !targetMedalEnvironment) {
      await interactionFromModal.editReply({
        content: "||WP121|| Ocorreu um erro, contate o desenvolvedor.",
      });

      return;
    }

    const previousMedal = Object.values(ENVIRONMENT.MEDALS).find(
      (medal) =>
        medal.index === targetMedalEnvironment?.index &&
        medal.level === targetMedalEnvironment?.level - 1
    );

    if (previousMedal) {
      await guild.members
        .removeRole({
          user: targetMember.id,
          role: previousMedal.id,
        })
        .catch(() =>
          this.container.logger.error(
            "[MedalInteractionHandler#run] Error to remove previous Medal level"
          )
        );

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
    }

    const notificationChannel = await this.container.client.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.GERAL
    );

    const authorResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true
      )
    );

    let habboName: string | undefined = undefined;

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboName = authorHabbo?.name ?? undefined;
    }

    if (notificationChannel?.isTextBased()) {
      await notificationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Medalha de Honra")
            .setAuthor({
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setImage(
              "https://media.discordapp.net/attachments/1289712570390810677/1290818444098277417/lac_2.gif?ex=6701239b&is=66ffd21b&hm=b68da3d686e912fdf7203991b8bd6b218628ea053272ed9c0c79fcc135a09310&="
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
                name: "",
                value: targetMedalEnvironment.description,
                inline: true,
              },
              {
                name: ":white_check_mark: Requisito",
                value: targetMedalEnvironment.required,
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
                value: `${authorDB?.habboName ?? habboName}`,
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
