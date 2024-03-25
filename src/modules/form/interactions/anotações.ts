import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import {
	type ButtonInteraction,
	type GuildMember,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

enum FeedbackInputIds {
	Role = "Role",
	Target = "Target",
	Content = "Content",
}

type FeedbackInput = keyof typeof FeedbackInputIds;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class NotesInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		const isAuthorized = await this.container.utilities.discord.hasPermission(
			{ category: "SECTOR", checkFor: "ADMINISTRATIVO" },
			interaction.member as GuildMember,
		);

		if (!isAuthorized) {
			return this.none();
		}

		return interaction.customId === FormIds.Anotar ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		const { result, interaction: i } =
			await this.container.utilities.inquirer.awaitModal<FeedbackInput>(
				interaction,
				{
					inputs: [
						new TextInputBuilder()
							.setLabel("Nick do Colaborador")
							.setCustomId(FeedbackInputIds.Target)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Cargo do Colaborador")
							.setCustomId(FeedbackInputIds.Content)
							.setStyle(TextInputStyle.Short)
							.setRequired(true),

						new TextInputBuilder()
							.setLabel("Descrição da Anotação")
							.setCustomId(FeedbackInputIds.Content)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true),
					],
					listenInteraction: true,
					title: "Anotação",
				},
			);

		const habboProfileResult = await this.container.utilities.habbo.getProfile(
			result.Target,
		);

		if (habboProfileResult.isErr()) {
			await i.reply({
				ephemeral: true,
				content: `Não foi possível encontrar o perfil do(a) usuário(a) "${result.Target}", verifique o nome e tente novamente.`,
			});

			return;
		}

		const habboProfile = habboProfileResult.unwrap();

		const embed = new EmbedBuilder()
			.setTitle("Anotação")
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/${habboProfile.user.figureString}`,
			)
			.addFields([
				{ name: "Nick", value: result.Target, inline: true },
				{ name: "Cargo", value: result.Role, inline: false },

				{ name: "Descrição", value: result.Content },
				{ name: "Autorizado Por", value: `${interaction.user}` },
			])
			.setAuthor({
				name: interaction.user.tag,
				iconURL: interaction.user.displayAvatarURL(),
			})
			.setFooter({
				text: "Aguardando aprovação",
			})
			.setColor(EmbedColors.Default);

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const channel = await guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_NOTES,
		);

		if (!channel || !channel.isTextBased()) {
			throw new Error("Channel not found.");
		}

		await channel.send({ embeds: [embed] });
	}
}
