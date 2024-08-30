import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes, Result,
} from "@sapphire/framework";

import {
	EmbedBuilder,
	GuildMember,
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
	Promoted = "Promoted",
	Performance = "Performance",
	PerformanceRate = "PerformanceRate",
	NeedsMoreFollowUp = "NeedsMoreFollowUp",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

let habboInteractionName: string | undefined = undefined;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class FollowUpFormInteractionHandler extends InteractionHandler {
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
			checkFor: "ADMINISTRATIVO",
			roles: member.roles,
		});

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Acompanhamento
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Promotor")
							.setPlaceholder("Se desejar, adicione informações extras aqui.")
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Nota de desempenho")
							.setPlaceholder("Ex.: 1, 2, 3, 4 ou 5")
							.setCustomId(FeedbackInputIds.PerformanceRate)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Motivo da nota")
							.setPlaceholder("Ex.: Muito bom")
							.setCustomId(FeedbackInputIds.Performance)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Precisa de mais acompanhamento?")
							.setPlaceholder("Ex.: Sim ou Não")
							.setCustomId(FeedbackInputIds.NeedsMoreFollowUp)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Acompanhamento",
				},
			);

		const { member: targetMember, habbo: targetHabbo } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				result.Target,
			);

		if (!targetHabbo) {
			await i.editReply({
				content:
					"Nenhum membro encontrado com esse nome, por favor tente novamente.",
			});

			return;
		}

		const targetJobId =
			targetMember &&
			this.container.utilities.discord.inferHighestJobRole(
				targetMember.roles.cache.map((r) => r.id),
			);

		const targetJobRole =
			targetJobId && (await targetMember.guild.roles.fetch(targetJobId));

		if (!targetJobRole) {
			await i.editReply({
				content:
					"Nenhum cargo de trabalho encontrado, por favor tente novamente.",
			});

			return;
		}

		const targets: string[] = [];

		for (const target of result.Promoted.split(/,/)) {
			// const [possibleTarget, possibleJob] = target
			// 	.split("//")
			// 	.map((r) => r.trim()) as [string, string | undefined];

			// if (!possibleTarget) {
			// 	this.container.logger.warn(
			// 		`Target ${target} not found in ${result.Promoted}.`,
			// 	);

			// 	continue;
			// }

			targets.push(target.replaceAll(MarkdownCharactersRegex, "\\$&"));

			// const { habbo, member } =
			// 	await this.container.utilities.habbo.inferTargetGuildMember(target);

			// const jobId =
			// 	member &&
			// 	this.container.utilities.discord.inferHighestJobRole(
			// 		member.roles.cache.map((r) => r.id),
			// 	);

			// const jobRole = jobId && (await member.guild.roles.fetch(jobId));

			// if (habbo && jobRole)
			// 	targets.push(`${habbo?.name} // ${jobRole.toString()}`);
			// else targets.push(`${possibleTarget} // ${possibleJob || "N/A"}`);
		}

    const authorResult =
    (await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true,
      ),
    ));

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
      });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

		const embed = new EmbedBuilder()
			.setTitle("Acompanhamento")
      .setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.addFields([
        {
          name: "👤 Autor",
          value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
        },
				{
					name: "🧑‍🏫 Promotor",
					value: `${targetHabbo.name.replaceAll(
						MarkdownCharactersRegex,
						"\\$&",
					)} // ${targetJobRole.toString()}`,
					inline: true,
				},
				{
					name: "🏆 Nota de Desempenho",
					value: result.PerformanceRate.replace(/[^0-9]/g, "") || "N/A",
					inline: true,
				},
				{
					name: "🗒️ Motivo da Nota",
					value: result.Target.length > 0 ? result.Performance : "N/A",
					inline: true,
				},
				{
					name: "⚠️ Precisa de mais acompanhamento?",
					value: result.Target.length > 0 ? result.NeedsMoreFollowUp : "N/A",
					inline: true,
				},
			])
			.setColor(EmbedColors.Default);

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_FOLLOWUP,
		);

		if (!channel?.isTextBased()) {
			throw new Error("Form followUp channel not found or not a text channel.");
		}

		await channel.send({
			embeds: [embed],
		});

		await i.deleteReply();
	}
}
