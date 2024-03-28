import { EmbedColors } from "$lib/constants/discord";
import { FormIds } from "$lib/constants/forms";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import type { Args } from "@sapphire/framework";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	type Message,
} from "discord.js";

@ApplyOptions<Command.Options>({
	name: "send-form",
	generateDashLessAliases: true,
	generateUnderscoreLessAliases: true,
})
export default class FormSendCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		if (!message.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const memberToCheck =
			message.member ?? (await message.guild?.members.fetch(message.author.id));

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			category: "SECTOR",
			checkFor: "FEDERAÇÃO",
			roles: memberToCheck.roles,
		});

		if (!isAuthorized) {
			this.container.logger.debug(
				`[FormSendCommand#messageRun] ${message.author.tag} tried to send a form without the proper permissions.`,
			);

			return;
		}

		const type = await args.pick("string");

		if (type === "aval") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Formulários de Avaliação / Entrevista")
						.setDescription(
							"Selecione o tipo de formulário que deseja e responda o questionário que será aberto. Ao finalizar, seu formulário será enviado para a equipe de avaliação.",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Avaliar")
							.setStyle(ButtonStyle.Success)
							.setCustomId(FormIds.Avaliação),

						new ButtonBuilder()
							.setLabel("Entrevistar")
							.setStyle(ButtonStyle.Primary)
							.setCustomId(FormIds.Entrevista),
					),
				],
			});

			return;
		}

		if (type === "org") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Formulários de Organizacional")
						.setDescription(
							"Selecione o tipo de formulário que deseja e responda o questionário que será aberto. Ao finalizar, seu formulário será enviado para o canal de relatórios.",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Relatório Presencial")
							.setStyle(ButtonStyle.Success)
							.setCustomId(FormIds.Organizacional),
					),
				],
			});
		}

		if (type === "acon") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Acompanhamento")
						.setDescription(
							"Clique no botão abaixo para abrir o questionário que, ao finalizar, será enviado para o canal de acompanhamentos.",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Acompanhamento")
							.setStyle(ButtonStyle.Success)
							.setCustomId(FormIds.Acompanhamento),
					),
				],
			});
		}
	}
}
