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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254541067456592/image-5.png?ex=66e5f6be&is=66e4a53e&hm=0db96174008110c92e1f76104be96c56575504c6188ac9cfbcc347d6fdf1f5e1&=&format=webp&quality=lossless"
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
              .setLabel("Entrega de Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId("LCST::MedalInteractionHandler"),

            new ButtonBuilder()
              .setLabel("Retirar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId("testing")
              .setDisabled(true)
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Criar Medalha")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.criarMedalha),

            new ButtonBuilder()
              .setLabel("Deletar Medalha")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(FormIds.deletarMedalha)
          ),

          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Listar Medalhas")
              .setStyle(ButtonStyle.Primary)
              .setCustomId(FormIds.listarMedalhas),

            new ButtonBuilder()
              .setLabel("Atualizar Medalha")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId("testing2")
              .setDisabled(true)
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254541298270312/image-6.png?ex=66e5f6be&is=66e4a53e&hm=8811a2e730b5bbd9e6f0f4955ad1bd2abf51be27062531e587131081a54dabd5&=&format=webp&quality=lossless"
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
              "https://media.discordapp.net/attachments/1217954543417950329/1224064093808365808/image.png?ex=661c2185&is=6609ac85&hm=9ac4561c8ea78258982f3648d5d7d5ba146b3ea7a0be20b99535c2c11d940eef&=&format=webp"
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254540488769669/image-3.png?ex=66e5f6be&is=66e4a53e&hm=198411ebcf5541fcd3b20d1682ed2df1d456239c8dcc7476d9c1a2dc410877ef&=&format=webp&quality=lossless"
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254540056760413/image-1.png?ex=66e5f6be&is=66e4a53e&hm=fcaf2c3d944f3ef2fcfe9d5c369a82e39204b70f40a4edd218feb9b04d0866c2&=&format=webp&quality=lossless"
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254540283121766/image-2.png?ex=66e5f6be&is=66e4a53e&hm=2f1408921ad03a58727c13c9c88b2ccab7b337b4e67f0374a9bf378c07943283&=&format=webp&quality=lossless"
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254541725962281/image.png?ex=66e5f6bf&is=66e4a53f&hm=58cb45e7011c2a79941c035706386b672cb133820dbbb15b553fff5499ce61c5&=&format=webp&quality=lossless"
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
              "https://media.discordapp.net/attachments/1266124737277595729/1284254540753014976/image-4.png?ex=66e5f6be&is=66e4a53e&hm=7b53a778d894641cef1e209db75fcdbfb744c07475140ecfa5d9208fd0cc03d4&=&format=webp&quality=lossless"
            ),
        ],
        components: [
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
