import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	Message,
} from "discord.js";

import { Args, Command } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";

import { FormIds } from "$lib/constants/forms";
import { EmbedColors } from "$lib/constants/discord";

import { encodeButtonId as encodeFireButtonId } from "../../ticket/interactions/fire";
import { encodeButtonId as encodeHireButtonId } from "../../ticket/interactions/hire";
import { encodeButtonId as encodeNoteButtonId } from "../../ticket/interactions/notes";
import { encodeButtonId as encodeWarnButtonId } from "../../ticket/interactions/warns";
import { encodeButtonId as encodeOmbudsmanButtonId } from "../../ticket/interactions/ticket";

import { encodeButtonId as encodeGroupButtonId } from "../../econ/interactions/mod-group";
import { encodeButtonId as encodeDepartmentButtonId } from "../../work/interactions/department";
import { encodeButtonId as encodeIndividualButtonId } from "../../econ/interactions/mod-individual";

@ApplyOptions<Command.Options>({ name: "send" })
export default class SendCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		if (!message.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const guild =
			message.guild ?? (await message.client.guilds.fetch(message.guildId));

		const member =
			message.member ?? (await guild.members.fetch(message.author.id));

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			checkFor: "PROMOCIONAL",
			category: "SECTOR",
			roles: member.roles,
		});

		if (!isAuthorized) return;
		const type = await args.pick("string");
		const validTypes = ["relink", "afastamento"];

		if (!validTypes.includes(type)) {
			await message.channel.send({
				content: `O tipo de comando enviado não existe, por favor verifique e tente novamente. (Tipos disponíveis: ${validTypes.join(
					", ",
				)})`,
			});

			if (type === "economia") {
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
			}

			if (type === "avaliativo") {
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
								.setStyle(ButtonStyle.Primary)
								.setCustomId(FormIds.Avaliação),

							new ButtonBuilder()
								.setLabel("Entrevistar")
								.setStyle(ButtonStyle.Secondary)
								.setCustomId(FormIds.Entrevista),
						),
					],
				});
			}

			if (type === "sugestão") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Sugestão / Reclamação e Denúncia / Acompanhamento")
							.setDescription(
								"Clique no botão abaixo para abrir o questionário que, ao finalizar, será enviado para o canal de acompanhamentos.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Sugestão")
								.setStyle(ButtonStyle.Success)
								.setCustomId(FormIds.Sugestão),

							new ButtonBuilder()
								.setLabel("Reclamação e Denúncia")
								.setStyle(ButtonStyle.Danger)
								.setCustomId(FormIds.Reclamação),

							new ButtonBuilder()
								.setLabel("Acompanhamento")
								.setStyle(ButtonStyle.Success)
								.setCustomId(FormIds.Acompanhamento),
						),
					],
				});
			}

			if (type === "organizacional") {
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

			if (type === "anotação") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Anotações / Advertências / Demissões")
							.setDescription(
								"Selecione o tipo de anotação que deseja e responda o questionário que será aberto. Ao finalizar, sua anotação será enviada para a equipe de anotação.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Anotar")
								.setStyle(ButtonStyle.Primary)
								.setCustomId(encodeNoteButtonId("Request")),

							new ButtonBuilder()
								.setLabel("Advertir")
								.setStyle(ButtonStyle.Secondary)
								.setCustomId(encodeWarnButtonId("Request")),

							new ButtonBuilder()
								.setLabel("Demitir")
								.setStyle(ButtonStyle.Danger)
								.setCustomId(encodeFireButtonId("Request")),
						),
					],
				});
			}

			if (type === "ouvidoria") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Ouvidoria")
							.setDescription(
								"Para enviar sugestões, reclamações ou duvidas! Um administrador irá responder o mais rápido possível.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Abrir Ticket")
								.setStyle(ButtonStyle.Primary)
								.setCustomId(
									encodeOmbudsmanButtonId({ action: "OpenDefault" }),
								),

							new ButtonBuilder()
								.setLabel("Enviar Elogios")
								.setStyle(ButtonStyle.Secondary)
								.setCustomId(encodeOmbudsmanButtonId({ action: "OpenPraise" })),
						),
					],
				});
			}

			if (type === "contratação") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Contratação / Promoção")
							.setDescription(
								"Escolha o tipo de ação que deseja fazer o clique no botão abaixo, preencha os formulários corretamente e aguarde a aprovação do seu pedido.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Contratar")
								.setStyle(ButtonStyle.Primary)
								.setCustomId(encodeHireButtonId("Request")),

							new ButtonBuilder()
								.setLabel("Promover")
								.setStyle(ButtonStyle.Success)
								.setCustomId("LCST::PromotionInteractionHandler"),
						),
					],
				});
			}

			if (type === "retorno") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Retorno")
							.setDescription(
								"Clique no botão abaixo para retornar de um afastamento.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Retornar")
								.setStyle(ButtonStyle.Success)
								.setCustomId(
									encodeDepartmentButtonId({ action: "SelfRequestReturn" }),
								),
						),
					],
				});
			}

			if (type === "afastamento") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Afastamento Temporário")
							.setDescription(
								"Selecione o tipo de afastamento que deseja e responda o questionário que será aberto. Ao finalizar, seu afastamento será enviado para o canal de relatórios.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Afastar")
								.setStyle(ButtonStyle.Primary)
								.setCustomId(
									encodeDepartmentButtonId({ action: "AdminRequestLeave" }),
								),

							new ButtonBuilder()
								.setLabel("Renovação")
								.setStyle(ButtonStyle.Secondary)
								.setCustomId(
									encodeDepartmentButtonId({ action: "SelfRequestRenew" }),
								),
						),
					],
				});
			}

			if (type === "relink") {
				await message.channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(EmbedColors.Default)
							.setTitle("Alterar Nickname")
							.setDescription(
								"Mudou seu apelido no Habbo? Clique no botão abaixo para automaticamente atualizar o seu perfil.",
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel("Renomear")
								.setStyle(ButtonStyle.Success)
								.setCustomId(FormIds.Renome),
						),
					],
				});
			}
		}
	}
}
