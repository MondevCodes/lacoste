import {
	InteractionHandler,
	InteractionHandlerTypes,
} from "@sapphire/framework";

import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction, EmbedBuilder } from "discord.js";

import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ENVIRONMENT } from "$lib/env";

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

		if (!habbo?.name) {
			await interaction.reply({
				content:
					"Não consegui encontrar o perfil do usuário, talvez sua conta esteja deletada?",
				ephemeral: true,
			});

			return;
		}

    const oldHabboName = existingUser.habboName;

    await this.container.prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        habboName: habbo.name
      },
    });

		await member?.setNickname(`· ${habbo.name}`).catch(() => null);

    const cachedGuild = await this.container.client.guilds.fetch(ENVIRONMENT.GUILD_ID);
    const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_CHANGED,
		);

    if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		await notificationChannel.send({embeds: [
      new EmbedBuilder()
        .setTitle("Mudança de nick no Habbo")
        .setFields([
          {
            name: "De",
            value: `${oldHabboName} ?? Nick antigo não cadastrado`,
          },
          {
            name: "Para",
            value: `${habbo.name} ?? Ocorreu um erro, contate o Desenvolvedor`
          },
        ])
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setColor(EmbedColors.Default)
        .setThumbnail(
          `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo.figureString}&size=b`,
        ),
    ],
		});

		await interaction.reply({
			content: "Seu perfil foi renomeado com sucesso.",
			ephemeral: true,
		});
	}
}
