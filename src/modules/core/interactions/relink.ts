import { ApplyOptions } from "@sapphire/decorators";
import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { GuildMember, type ButtonInteraction } from "discord.js";

import { FormIds } from "$lib/constants/forms";

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class EvaluationFormInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		return interaction.customId === FormIds.Renome ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction) {
		if (!interaction.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const existingUser = await this.container.prisma.user.findUnique({
			where: { discordId: interaction.user.id },
		});

		if (!existingUser) {
			await interaction.reply({
				content:
					"Não consegui encontrar o perfil do usuário, tem certeza que ele está registrado no servidor?",
				ephemeral: true,
			});

			return;
		}

		const habbo = (
			await this.container.utilities.habbo.getProfile(existingUser.habboId)
		).unwrapOr(null);

		if (!habbo) {
			await interaction.reply({
				content:
					"Não consegui encontrar o perfil do usuário, talvez sua conta esteja deletada?",
				ephemeral: true,
			});

			return;
		}

		const username =
			interaction.member instanceof GuildMember
				? interaction.member.displayName
				: (await interaction.guild?.members.fetch(interaction.user.id))
						?.displayName;

		if (username?.replace("· ", "") === habbo.user.name) {
			await interaction.guild?.members.edit(interaction.user, {
				nick: `· ${habbo.user.name}`,
			});

			await interaction.reply({
				content: "Seu perfil foi renomeado.",
				ephemeral: true,
			});

			return;
		}

		await interaction.reply({
			content: "Seu perfil não foi renomeado pois o nome não mudou.",
			ephemeral: true,
		});
	}
}
