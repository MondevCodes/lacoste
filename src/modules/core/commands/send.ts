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

		const validTypes = [
			"economia",
			"avaliativo",
			"sugestão",
			"organizacional",
			"anotação",
			"ouvidoria",
			"contratação",
			"retorno",
			"afastamento",
			"relink",
		];

		if (!validTypes.includes(type)) {
			await message.channel.send({
				content: `O tipo de comando enviado não existe, por favor verifique e tente novamente. (Tipos disponíveis: ${validTypes.join(
					", ",
				)})`,
			});

			return;
		}

		if (type === "economia") {
			await message.channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(EmbedColors.Default)
						.setTitle("Controle Financeiro")
						.setDescription(
							'Para adicionar ou remover um membro específico ou de um grupo (ex. setor estagiário), basta clicar no botão correspondente. Em adição ou remoção em grupo, use vírgula (",") para separar os nicks (ex. Brendo, Fortissima, Trobs).',
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224064257084100778/Lac_8.png?ex=661c21ac&is=6609acac&hm=1446a824b74f9b0bc102f07047c4ecca95ad0c91a2f904b655913910980a58fe&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224063695009747075/image.png?ex=661c2126&is=6609ac26&hm=824f9653ce6f6317d59675927f7707b078d299221159ce4a7ac26b69d13e9aeb&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224064093808365808/image.png?ex=661c2185&is=6609ac85&hm=9ac4561c8ea78258982f3648d5d7d5ba146b3ea7a0be20b99535c2c11d940eef&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224063783551504554/image.png?ex=661c213c&is=6609ac3c&hm=c3b512fc1e956cde8d78bcc6ff93c7f1ee3bda9ebe5b54aa804cbe2c0cbb79da&=&format=webp",
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
							"Para realizar uma demissão, anotação ou advertência, será criado um ticket correspondente a ação escolhida. Fique atento ao canal que será gerado e as perguntas feitas pelo BOT. \n\nClique no botão que corresponda à ação desejada.",
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224064012820418622/image.png?ex=661c2172&is=6609ac72&hm=04bd0e02ed2f999e700a662e18dd8915407e0435aa6834e48d9856acecc1a189&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224063318696919121/image.png?ex=661c20cd&is=6609abcd&hm=50887b1632ce7a97b9a7df629c79a9c56bccfa25a3967f25eec4bf89d7f8c582&=&format=webp",
						),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setLabel("Abrir Ticket")
							.setStyle(ButtonStyle.Primary)
							.setCustomId(encodeOmbudsmanButtonId({ action: "OpenDefault" })),

						new ButtonBuilder()
							.setLabel("Enviar Elogios")
							.setStyle(ButtonStyle.Secondary)
							.setCustomId(encodeOmbudsmanButtonId({ action: "OpenPraise" }))
							.setDisabled(true),
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224063918696042626/image.png?ex=661c215c&is=6609ac5c&hm=d3c5063fba91b95885042c685a2c90a113151d13f4af15ae6b8d397c4202614a&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224063228032847973/Lac_5.png?ex=661c20b7&is=6609abb7&hm=ec69af3e4845f6aabecf8411de36a25be053f0b494dbe47d36c981169cfd1e1b&=&format=webp",
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
						)
						.setImage(
							"https://media.discordapp.net/attachments/1217954543417950329/1224064191036522516/Lac_7.png?ex=661c219d&is=6609ac9d&hm=d24c6a91a139e628d2a7c27ccf9e1f3c62898b2dc1def111ff402c7f852b24e6&=&format=webp",
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
