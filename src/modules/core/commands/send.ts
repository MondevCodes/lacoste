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

import { encodeButtonId as encodeChangeButtonId } from "../../core/interactions/changeHBAccount";

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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294794427231109151/LacFundacao_4.gif?ex=670cf787&is=670ba607&hm=0d4d3c5f4410572bcb1edd7f0582cfcbe3cb83e9afbb76f23adafe4dec2dddbd&"
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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294797992876052510/LacAV.gif?ex=670cfad9&is=670ba959&hm=3226d067f404eb71a282fd078ce7db1a119437691290c423cd7a92ec16d63c64&"
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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294794522731217028/LacDir.gif?ex=670cf79e&is=670ba61e&hm=863287f386e44ea07dbc4bea2712f326da5bde40556f57365ef4d505b460f805&"
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
              "Selecione o tipo de formulário que deseja e responda o questionário que será aberto. Ao finalizar, seu formulário será enviado para o canal de relatórios."
            )
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294796987853574255/LacORG.gif?ex=670cf9ea&is=670ba86a&hm=215638161d82a0589dd2b75e6c1291c527d630980a2b75660351e4b6452ef1e1&"
            ),
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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294795359503122442/LacADM.gif?ex=670cf865&is=670ba6e5&hm=3e0824aafa7444f7492d161f0e0927599573d6d9cfda783a7c493f84914bad45&"
            ),
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
              .setCustomId(encodeFireButtonId("Request"))
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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294799812083978310/LacOUV.gif?ex=670cfc8b&is=670bab0b&hm=06d4f379b45be6584ef9996703243e666fab321cb5bc0bb063376cfae86bfc09&"
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
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294796116965199922/LacPRO.gif?ex=670cf91a&is=670ba79a&hm=be26a0beb0606810bb06659e771773e4ad14c53432b995e6cd2aa5affbe27c40&"
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
            .setTitle("Alterar Nickname")
            .setDescription(
              "Mudou seu apelido no Habbo? Clique no botão abaixo para automaticamente atualizar o seu perfil."
            )
            .setImage(
              "https://cdn.discordapp.com/attachments/1294794325598933103/1294798656171409489/LacAV_1.gif?ex=670cfb77&is=670ba9f7&hm=82f2eaf9a7098c409689d77e931d4210d8d7803e9a3cc3917cb9d65ad411a7a2&"
            ),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Trocar conta do Habbo")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(encodeChangeButtonId("Request")),

            new ButtonBuilder()
              .setLabel("Trocar conta do Discord")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId("testingDC")
              .setDisabled(true)
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
