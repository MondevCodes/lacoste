import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction } from "discord.js";

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

		const { habbo, member } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				existingUser.habboId,
			);

		if (!habbo?.user.name) {
			await interaction.reply({
				content:
					"Não consegui encontrar o perfil do usuário, talvez sua conta esteja deletada?",
				ephemeral: true,
			});

			return;
		}

		await member?.setNickname(`· ${habbo.user.name}`);

		await interaction.reply({
			content: "Seu perfil foi renomeado.",
			ephemeral: true,
		});
	}
}
