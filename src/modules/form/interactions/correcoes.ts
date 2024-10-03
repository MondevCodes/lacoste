import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  Result,
} from "@sapphire/framework";

import {
  EmbedBuilder,
  GuildMember,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";

import { isTruthy } from "remeda";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";
import { HabboUser } from "$lib/utilities/habbo";

enum FixFormInputIds {
  Time = "Time",
  Nicks = "Nicks",
}

type OrganizationalFormInput = keyof typeof FixFormInputIds;

const MARKDOWN_CHARS_RE =
  /((`){1,3}|(\*){1,3}|(~){2}|(\|){2}|^(>){1,3}|(_){1,2})+/gm;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class CorrecoesFormInteractionHandler extends InteractionHandler {
  public override async parse(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) {
      throw new Error("Cannot check permissions outside of a guild.");
    }

    const guild = await this.container.utilities.discord.getGuild();

    const member = !(interaction.member instanceof GuildMember)
      ? await guild.members.fetch(interaction.member.user.id)
      : interaction.member;

    const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
      category: "SECTOR",
      checkFor: "PROMOCIONAL",
      roles: member.roles,
    });

    if (!isAuthorized) {
      return this.none();
    }

    return interaction.customId === FormIds.OrganizacionalCorrecao
      ? this.some()
      : this.none();
  }

  public override async run(interaction: ButtonInteraction) {
    const guildCache = await this.container.utilities.discord.getGuild();

    const member = !(interaction.member instanceof GuildMember)
      ? await guildCache.members.fetch(interaction.user.id)
      : interaction.member;

    // const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
    // 	category: "SECTOR",
    // 	checkFor: "PROMOCIONAL",
    // 	roles: member.roles,
    // });

    const isAuthorized = member.roles.cache.hasAny(
      "1009452772200030289" || "1008077046955651193"
    );

    if (!isAuthorized) {
      await interaction.reply({
        content: `Não autorizado. Você precisa ter o cargo de <@&1009452772200030289> para acessar a função "Correções".`,
        ephemeral: true,
      });

      return;
    }

    const { result, interaction: interactionFromModal } =
      await this.container.utilities.inquirer.awaitModal<OrganizationalFormInput>(
        interaction,
        {
          inputs: [
            new TextInputBuilder()
              .setLabel("Dia referente")
              .setPlaceholder("Ex.: 01/01/2024")
              .setCustomId(FixFormInputIds.Time)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),

            new TextInputBuilder()
              .setLabel("Nicks para correção no relatório presencial")
              .setPlaceholder(">> ATENÇÃO: SEPARE OS NICKS POR LINHA <<")
              .setCustomId(FixFormInputIds.Nicks)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ],
          listenInteraction: true,
          title: "Formulário Correção",
        }
      );

    for (const [key, value] of Object.entries(result)) {
      if (isTruthy(value)) continue;
      result[key as OrganizationalFormInput] = "N/D";
    }

    const targets = {
      Nicks: result.Nicks,
    };

    type Targets = keyof typeof targets;

    this.container.logger.info(
      "[OrganizationalFormInteractionHandler#run] Report",
      { report: JSON.stringify(result, null, 2) }
    );

    const members: Record<Targets, (GuildMember | string)[]> = {
      Nicks: [],
    };

    const unparsedTargets: [keyof typeof targets, string][] = [];

    for (const [key, value] of Object.entries(targets) as [Targets, string][]) {
      if (value === "N/D") continue;

      unparsedTargets.push(
        ...value
          .split(/[\s\n\r]+/gm)
          .filter((v) => v !== "")
          .map((v) => [key, v] as (typeof unparsedTargets)[number])
      );
    }
    for (const [group, target] of unparsedTargets as [Targets, string][]) {
      if (target === "N/D") return;

      // const onlyHabbo = (await this.container.utilities.habbo.getProfile(target)).unwrapOr(
      //   undefined,
      // );

      // if (!onlyHabbo?.name) {
      //   this.container.logger.warn(
      // 		`[CorreçãoFormInteractionHandler#run] Couldn't find target: ${target}.`,
      // 	);

      //   await interactionFromModal.editReply({
      //     content:
      //       `Não consegui encontrar esse usuário no Habbo: **${target}** tem certeza que digitou o Nick corretamente? Ou a conta do mesmo no jogo está pública?`,
      //   });

      // 	return;
      // }

      const targetMember = await this.container.prisma.user.findMany({
        take: 2,
        where: {
          habboName: {
            endsWith: target,
            mode: "insensitive",
          },
        },
        select: {
          habboId: true,
          habboName: true,
        },
      });

      if (targetMember.length > 1) {
        await interactionFromModal.editReply({
          content: `Encontrei mais de um usuário que o nome acaba com: **${target}** \nEscreva o nick corretamente ou seja mais específico`,
        });

        return;
      }

      // const inferredTarget = await Result.fromAsync(
      // 	this.container.utilities.habbo.inferTargetGuildMember(target),
      // );

      // const { habbo: targetHabbo, member: targetMember } =
      // 	inferredTarget.unwrapOr({ habbo: undefined, member: undefined });

      if (!targetMember) {
        this.container.logger.warn(
          `[CorreçãoFormInteractionHandler#run] Couldn't find target: ${target}.`
        );

        await interactionFromModal.editReply({
          content: `Não consegui encontrar o usuário como vinculado: **${target}** \nVerifique se o mesmo está realmente vinculado **ou vincule-o**`,
        });

        return;
      }

      for await (const user of targetMember) {
        if (targetMember)
          await this.container.prisma.user.update({
            where: { habboId: user.habboId },
            data: { reportsHistory: { push: new Date() } },
          });

        members[group].push(
          user.habboName.replaceAll(MARKDOWN_CHARS_RE, "\\$&")
        );
      }
    }

    this.container.logger.info("[CorrecaoFormInteractionHandler#run] Members", {
      members: JSON.stringify(members, null, 2),
    });

    const authorResult = await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true
      )
    );

    let habboInteractionName: HabboUser | string | undefined;
    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

    const authorDb = await this.container.prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    const embed = new EmbedBuilder()
      .setTitle("Correções")
      .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .addFields(
        {
          name: "👤 Autor",
          value: `${authorDb?.habboName ?? habboInteractionName}`,
        },
        {
          name: "📅 Referentes ao dia",
          value: result[FixFormInputIds.Time],
        },
        {
          name: "🔧 Nicks corrigidos",
          value: this.#joinList(
            members.Nicks.map((x) =>
              typeof x === "string" ? x : x.user.toString()
            )
          ),
        }
      )
      .setFooter({
        text: "Este relatório contém os nicks corrigidos dos colaboradores, que haviam sido escritos incorretamente em um dia específico, permitindo assim a contabilização correta de suas presenças.",
      })
      .setColor(EmbedColors.FixOrganizational);

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

    const channel = await guild.channels.fetch(
      ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_ORGANIZATIONAL
    );

    if (channel === null || !channel.isTextBased()) {
      throw new Error("Forms channel not found or not a text channel.");
    }

    await channel.send({
      embeds: [embed],
    });

    await interactionFromModal
      .deleteReply()
      .catch(() =>
        this.container.logger.error("[Form] Couldn't delete reply.")
      );
  }

  #joinList(list: string[]) {
    if (list.length === 0) {
      return "N/D";
    }

    return `${list.map((x) => x.split("\\n")).join("\n")}`;
  }
}
