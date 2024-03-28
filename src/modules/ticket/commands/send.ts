import { EmbedColors } from "$lib/constants/discord";
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
import { encodeButtonId as encodeFireButtonId } from "../interactions/fire";
import { encodeButtonId as encodeHireButtonId } from "../interactions/hire";
import { encodeButtonId as encodeNoteButtonId } from "../interactions/notes";
import { encodeButtonId as encodeWarnButtonId } from "../interactions/warns";

@ApplyOptions<Command.Options>({
	name: "send-ticket",
	generateDashLessAliases: true,
	generateUnderscoreLessAliases: true,
})
export default class TicketSendCommand extends Command {
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
				`[TicketSendCommand#messageRun] ${message.author.tag} tried to send a ticket without the proper permissions.`,
			);

			return;
		}

		const type = await args.pick("string");

		if (type === "fire") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Contratação / Demissão")
						.setDescription(
							"Selecione o tipo de contratação que deseja e responda o questionário que será aberto. Ao finalizar, sua contratação será enviada para a equipe de contratação.",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Contratar")
							.setStyle(ButtonStyle.Success)
							.setCustomId(encodeHireButtonId("Request")),

						new ButtonBuilder()
							.setLabel("Demitir")
							.setStyle(ButtonStyle.Danger)
							.setCustomId(encodeFireButtonId("Request")),
					),
				],
			});

			return;
		}

		if (type === "notes") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Anotações / Advertências")
						.setDescription(
							"Selecione o tipo de anotação que deseja e responda o questionário que será aberto. Ao finalizar, sua anotação será enviada para a equipe de anotação.",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Anotar")
							.setStyle(ButtonStyle.Success)
							.setCustomId(encodeNoteButtonId("Request")),

						new ButtonBuilder()
							.setLabel("Advertir")
							.setStyle(ButtonStyle.Danger)
							.setCustomId(encodeWarnButtonId("Request")),
					),
				],
			});

			return;
		}
	}
}
