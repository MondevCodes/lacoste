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
} from "discord.js";

import { values } from "remeda";
import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";

type InGuild = "cached" | "raw";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class RemoveMedalInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.customId.match("LCST::RemoveMedalInteractionHandler")) {
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
        title: "Retirar Medalha",
        listenInteraction: true,

        inputs: [
          new TextInputBuilder()
            .setCustomId("target")
            .setLabel("Colaborador")
            .setPlaceholder("Informe o Habbo (Nick).")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
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

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));

    const allUserMedals = await this.container.prisma.medals.findMany({
      where: {
        users: {
          has: targetMember.user.id,
        },
      },
    });

    if (allUserMedals.length < 1) {
      await interactionFromModal.editReply({
        content: "O colaborador não possui nenhuma medalha acumulada",
      });

      return;
    }

    const medalChoices = await Promise.all(
      values(allUserMedals).map(
        async (value) =>
          value.discordId &&
          (guild.roles.cache.get(value.discordId) ??
            (await guild.roles.fetch(value.discordId)))
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
          question:
            "Selecione a medalha que o colaborador possui e deseja remover.",
        }
      );

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
                `Remover <@&${targetMedalId}> de <@${targetMember.user.id}>?`
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
            "[RemoveMedalInteractionHandler] Couldn't delete reply."
          )
        );

      return;
    }

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

    await guild.members
      .removeRole({
        user: targetMember.id,
        role: targetMedal,
      })
      .catch(() =>
        this.container.logger.error(
          "[RemoveMedalInteractionHandler#run] Error to remove target Medal"
        )
      );

    await this.container.prisma.medals.update({
      where: {
        discordId: targetMedalDB.discordId,
      },
      data: {
        users: {
          set: targetMedalDB.users.filter((id) => id !== targetMember.user.id),
        },
      },
    });

    await interactionFromModal.editReply({
      content: `Medalha <@&${targetMedalId}> removida com sucesso de **${existingUser.habboName}** ✅`,
      embeds: [],
      components: [],
    });
  }
}
