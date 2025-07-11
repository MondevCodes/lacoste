import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from "discord.js";

@ApplyOptions<Command.Options>({
  name: "clear-commands",
  description: "Remove todos os slash commands do servidor e globalmente",
})
export default class ClearCommandsCommand extends Command {
  public override async messageRun(message: Message) {
    if (!message.inGuild())
      throw new Error("Cannot check permissions outside of a guild.");

    const isAuthorized = message.member.roles.cache.has("1208559275421597776");

    if (!isAuthorized) {
      await message.reply({
        content: `❌ Não autorizado. Você precisa ter o cargo de <@&1208559275421597776> para dar comandos de Desenvolvedor.`,
      });

      return;
    }

    if (ENVIRONMENT.NODE_ENV === "production") {
      await message.reply({
        content: `❌ Não permitido, este comando é **apenas permitido para Bots de Teste**.`,
      });

      return;
    }

    const confirmButton = new ButtonBuilder()
      .setCustomId("confirm_clear")
      .setLabel("Confirmar")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel_clear")
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    const confirmMessage = await message.reply({
      content:
        `⚠️ **ATENÇÃO!** Isso irá remover TODOS os slash commands **DESTE BOT** (${message.client.user?.username}).\n\n` +
        `🤖 **Bot ID:** \`${message.client.user?.id}\`\n` +
        `🌍 **Ambiente:** \`${ENVIRONMENT.NODE_ENV}\`\n\n` +
        `Clique em **Confirmar** para prosseguir ou **Cancelar** para abortar.`,
      components: [row],
    });

    try {
      const interaction = await confirmMessage.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
      });

      if (interaction.customId === "confirm_clear") {
        await interaction.update({
          content: "🔄 Processando...",
          components: [],
        });
        await this.clearAllCommands(message, confirmMessage);
      } else {
        await interaction.update({
          content: "❌ Operação cancelada.",
          components: [],
        });
      }
    } catch (error) {
      await confirmMessage.edit({
        content: "⏰ Tempo esgotado. Operação cancelada.",
        components: [],
      });
    }

    setTimeout(async () => {
      try {
        await confirmMessage.delete();
      } catch (error: any) {
        this.container.logger.warn(
          `[ClearCommandsCommand#messageRun] Mensagem ${confirmMessage.id} já deletada. Erro: ${error.message}`
        );
      }
    }, 5000);
  }

  private async clearAllCommands(message: Message, confirmMessage: Message) {
    try {
      const client = message.client;
      const botId = client.user?.id;

      if (!botId) throw new Error("Não foi possível obter o ID do bot");

      let removedGuildCommands = 0;
      let removedGlobalCommands = 0;

      if (message.guild) {
        const guildCommands = await message.guild.commands.fetch();
        const botGuildCommands = guildCommands.filter(
          (cmd) => cmd.applicationId === botId
        );

        for await (const [_, command] of botGuildCommands) {
          await command.delete();
          removedGuildCommands++;
        }
      }

      const globalCommands = await client.application?.commands.fetch();
      if (globalCommands) {
        const botGlobalCommands = globalCommands.filter(
          (cmd) => cmd.applicationId === botId
        );

        for await (const [_, command] of botGlobalCommands) {
          await command.delete();
          removedGlobalCommands++;
        }
      }

      await confirmMessage.delete();

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `📊 **Resumo:**\n` +
                `• Comandos do servidor: ${removedGuildCommands}\n` +
                `• Comandos globais: ${removedGlobalCommands}\n\n` +
                `**Nota:** Pode levar alguns minutos para as alterações serem aplicadas no Discord. Utilize **CTRL + R** para verificar instantaneamente.`
            )
            .setColor(EmbedColors.Success)
            .setTitle("🎉 Comandos deste bot removidos com sucesso!"),
        ],
      });
    } catch (error) {
      this.container.logger.error("Erro ao limpar comandos:", error);

      await confirmMessage.edit({
        content:
          "❌ Erro ao remover os comandos. Verifique as permissões do bot e tente novamente.",
        components: [],
      });
    }
  }
}
