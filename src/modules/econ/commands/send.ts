import { EmbedColors } from "$lib/constants/discord";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	type Message,
} from "discord.js";
import { encodeButtonId as encodeGroupButtonId } from "../interactions/mod-group";
import { encodeButtonId as encodeIndividualButtonId } from "../interactions/mod-individual";

@ApplyOptions<Command.Options>({
	name: "send-econ",
	generateDashLessAliases: true,
	generateUnderscoreLessAliases: true,
})
export default class EconSendCommand extends Command {
	public override async messageRun(message: Message) {
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
				`[EconSendCommand#messageRun] ${message.author.tag} tried to send a econ without the proper permissions.`,
			);

			return;
		}

		await message.channel.send({
			embeds: [
				new EmbedBuilder()
					.setColor(EmbedColors.Default)
					.setTitle("Controle Financeiro")
					.setDescription(
						"Para adicionar ou remover um membro específico ou de um grupo (ex. setor estagiário), basta clicar no botão correspondente.",
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setLabel("Adicionar p/ Indivíduo")
						.setStyle(ButtonStyle.Success)
						.setCustomId(encodeIndividualButtonId("Add")),

					new ButtonBuilder()
						.setLabel("Remover p/ Indivíduo")
						.setStyle(ButtonStyle.Secondary)
						.setCustomId(encodeIndividualButtonId("Del")),
				),

				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setLabel("Adicionar p/ Grupo")
						.setStyle(ButtonStyle.Success)
						.setCustomId(encodeGroupButtonId("Add")),

					new ButtonBuilder()
						.setLabel("Remover p/ Grupo")
						.setStyle(ButtonStyle.Secondary)
						.setCustomId(encodeGroupButtonId("Del")),
				),
			],
		});

		// const type = await args.pick("string");

		// if (type === "grp") {
		// 	await message.channel.send({
		// 		embeds: [
		// 			new EmbedBuilder()
		// 				.setColor(EmbedColors.Default)
		// 				.setTitle("Financeiro / Grupo")
		// 				.setDescription(
		// 					"Para adicionar ou remover um membro do grupo (ex. setor estagiário), basta clicar no botão correspondente.",
		// 				),
		// 		],
		// 		components: [
		// 			new ActionRowBuilder<ButtonBuilder>().addComponents(
		// 				new ButtonBuilder()
		// 					.setLabel("Adicionar")
		// 					.setStyle(ButtonStyle.Success)
		// 					.setCustomId(encodeGroupButtonId("Add")),

		// 				new ButtonBuilder()
		// 					.setLabel("Remover")
		// 					.setStyle(ButtonStyle.Secondary)
		// 					.setCustomId(encodeGroupButtonId("Del")),
		// 			),
		// 		],
		// 	});

		// 	return;
		// }

		// if (type === "ind") {
		// 	await message.channel.send({
		// 		embeds: [
		// 			new EmbedBuilder()
		// 				.setColor(EmbedColors.Default)
		// 				.setTitle("Financeiro / Individual")
		// 				.setDescription(
		// 					"Para adicionar ou remover um membro específico, basta clicar no botão correspondente.",
		// 				),
		// 		],
		// 		components: [
		// 			new ActionRowBuilder<ButtonBuilder>().addComponents(
		// 				new ButtonBuilder()
		// 					.setLabel("Adicionar")
		// 					.setStyle(ButtonStyle.Success)
		// 					.setCustomId(encodeIndividualButtonId("Add")),

		// 				new ButtonBuilder()
		// 					.setLabel("Remover")
		// 					.setStyle(ButtonStyle.Secondary)
		// 					.setCustomId(encodeIndividualButtonId("Del")),
		// 			),
		// 		],
		// 	});

		// 	return;
		// }
	}
}
