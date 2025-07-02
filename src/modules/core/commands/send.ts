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
import { ImgThumbnail } from "$lib/constants/imgs-thumbnail";

import { encodeButtonId as encodeFireButtonId } from "../../ticket/interactions/fire";
import { encodeButtonId as encodeHireButtonId } from "../../ticket/interactions/hire";
import { encodeButtonId as encodeNoteButtonId } from "../../ticket/interactions/notes";
import { encodeButtonId as encodeWarnButtonId } from "../../ticket/interactions/warns";
import { encodeButtonId as encodeDowngradeButtonId } from "../../ticket/interactions/downgrade";
import { encodeButtonId as encodeOmbudsmanButtonId } from "../../ticket/interactions/ticket";

import { encodeButtonId as encodeGroupButtonId } from "../../econ/interactions/mod-group";
import { encodeButtonId as encodeDepartmentButtonId } from "../../work/interactions/department";
import { encodeButtonId as encodeIndividualButtonId } from "../../econ/interactions/mod-individual";

import { encodeButtonId as encodeChangeHBButtonId } from "../../core/interactions/changeHBAccount";
import { encodeButtonId as encodeChangeDCButtonId } from "../../core/interactions/changeDiscordAccount";

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
      "relink",
    ];

    if (!validTypes.includes(type)) {
      await message.channel.send({
        content: `O tipo de comando enviado não existe, por favor verifique e tente novamente. (Tipos disponíveis: ${validTypes.join(
          ", "
        )})`,
      });

      return;
    }

    if (type === "economia") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Processos da Fundação ")
            .setDescription(
              '**Controle Financeiro**\n Para adicionar ou remover de membro específico ou de um grupo (ex. setor estagiário), basta clicar no botão correspondente. Em adição ou remoção em grupo, use vírgula (",") para separar os nicks (ex: Brendo, Fortissima).\n\n **Medalhas**\n Siga a função correspondente.'
            )
            .setImage(ImgThumbnail.Fundacao),
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
              .setCustomId(encodeIndividualButtonId("Del"))
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Adicionar p/ Grupo")
              .setStyle(ButtonStyle.Success)
              .setCustomId(encodeGroupButtonId("Add")),

            new ButtonBuilder()
              .setLabel("Remover p/ Grupo")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(encodeGroupButtonId("Del"))
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Entregar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId("LCST::MedalInteractionHandler"),

            new ButtonBuilder()
              .setLabel("Retirar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId("LCST::RemoveMedalInteractionHandler")
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Criar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.criarMedalha),

            new ButtonBuilder()
              .setLabel("Deletar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.deletarMedalha)
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Listar Medalhas")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.listarMedalhas),

            new ButtonBuilder()
              .setLabel("Editar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.editarMedalha)
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
              "Selecione o tipo de formulário que deseja e responda o questionário que será aberto. Ao finalizar, seu formulário será enviado para a equipe de avaliação."
            )
            .setImage(ImgThumbnail.Avaliativo),
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
              .setCustomId(FormIds.Entrevista)
          ),
        ],
      });
    }

    if (type === "sugestão") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Sugestão / Reclamação e Denúncia")
            .setDescription(
              "Clique no botão abaixo para abrir o questionário que, ao finalizar, será enviado para o canal de sugestões ou reclamações."
            )
            .setImage(ImgThumbnail.Diretoria),
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
              .setCustomId(FormIds.Reclamação)
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
              "**Relatório Presencial** \nUtilize para registrar as presenças dos colaboradores na sede. \n \n**Correções** \nUtilize para ajustar as presenças dos colaboradores em relação às metas. \nFunção restrita ao comitê organizacional. \n \n**Adicionar/Remover Presenças** \nRealize ajustes no perfil dos colaboradores com base no tema de presenças. \nFunção restrita ao líder organizacional."
            )
            .setImage(ImgThumbnail.Organizacional),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Relatório Presencial")
              .setStyle(ButtonStyle.Success)
              .setCustomId(FormIds.Organizacional),

            new ButtonBuilder()
              .setLabel("Correções")
              .setStyle(ButtonStyle.Danger)
              .setCustomId(FormIds.OrganizacionalCorrecao)
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Adicionar Presenças")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.adicionarPresença),

            new ButtonBuilder()
              .setLabel("Remover Presenças")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(FormIds.removerPresença)
          ),
        ],
      });
    }

    if (type === "anotação") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Processos Administrativos")
            .setDescription(
              "Considere nossas normas atuais antes de aplicar uma função.\nFique atento ao canal que será gerado e as perguntas feitas pelo BOT, em seguida o registro da mesma será publicado. \n\nClique no botão que corresponda à ação desejada."
            )
            .setImage(ImgThumbnail.Administrativo),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Anotar")
              .setStyle(ButtonStyle.Danger)
              .setCustomId(encodeNoteButtonId("Request")),

            new ButtonBuilder()
              .setLabel("Advertir")
              .setStyle(ButtonStyle.Danger)
              .setCustomId(encodeWarnButtonId("Request")),

            new ButtonBuilder()
              .setLabel("Demitir")
              .setStyle(ButtonStyle.Danger)
              .setCustomId(encodeFireButtonId("Request")),

            new ButtonBuilder()
              .setLabel("Rebaixar")
              .setStyle(ButtonStyle.Danger)
              .setCustomId(encodeDowngradeButtonId("Request"))
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Afastar")
              .setStyle(ButtonStyle.Success)
              .setCustomId(
                encodeDepartmentButtonId({ action: "AdminRequestLeave" })
              ),
            new ButtonBuilder()
              .setLabel("Retornar")
              .setStyle(ButtonStyle.Success)
              .setCustomId(
                encodeDepartmentButtonId({ action: "SelfRequestReturn" })
              )
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Acompanhar Gerência")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.Acompanhamento),
            new ButtonBuilder()
              .setLabel("Acompanhar Administração")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.AcompanhamentoAdm)
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
              "Para enviar sugestões, reclamações, dúvidas ou solicitar medalhas aperte no Ticket! Um administrador irá responder o mais rápido possível. Fique a vontade para enviar um elogio também."
            )
            .setImage(ImgThumbnail.Ouvidoria),
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
              .setCustomId(FormIds.Elogio)
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
              "Escolha o tipo de ação que deseja fazer o clique no botão abaixo, preencha os formulários corretamente e aguarde a aprovação do seu pedido."
            )
            .setImage(ImgThumbnail.Promocional),
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
              .setCustomId("LCST::PromotionInteractionHandler")
          ),
        ],
      });
    }

    if (type === "relink") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EmbedColors.Default)
            .setTitle("Alterar Conta")
            .setDescription(
              "**Alteração de Nickname**\nMudou seu apelido no Habbo? Clique no botão 'Renomear' para automaticamente atualizar o seu perfil.\n\n**Alteração de Conta do Habbo**\nMudou de conta no Habbo? Clique no botão 'Trocar conta do Habbo' para seus dados serem atualizados.\nAguarde a aprovação.\n\n**Alteração de Conta do Discord**\nMudou de conta no discord? Clique no botão 'Trocar conta do discord' para seus dados serem atualizados.\nAguarde a aprovação."
            )
            .setImage(ImgThumbnail.MudarConta),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Trocar conta do Habbo")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(encodeChangeHBButtonId("Request")),

            new ButtonBuilder()
              .setLabel("Trocar conta do Discord")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(encodeChangeDCButtonId("Request"))
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Renomear")
              .setStyle(ButtonStyle.Success)
              .setCustomId(FormIds.Renome)
          ),
        ],
      });
    }
  }
}
