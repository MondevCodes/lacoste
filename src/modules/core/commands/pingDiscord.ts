import { EmbedColors } from "$lib/constants/discord";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";

@ApplyOptions<Command.Options>({
  name: "pingDiscord",
})
export class pingDiscord extends Command {
  public override async messageRun(message: Message) {
    const discordPing = Math.round(message.client.ws.ping);

    let latencyStatus: string | undefined;
    let embedColor: string | EmbedColors = EmbedColors.Default;

    if (discordPing <= 100)
      (latencyStatus = "Boa"), (embedColor = EmbedColors.AddAmount);
    else if (discordPing > 100 && discordPing <= 200)
      (latencyStatus = "Moderada"), (embedColor = EmbedColors.Alert);
    else if (discordPing > 200 && discordPing <= 500)
      (latencyStatus = "Ruim"), (embedColor = EmbedColors.RemoveAmount);
    else if (discordPing > 500)
      (latencyStatus = "Muito ruim"), (embedColor = EmbedColors.Error);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Latência Discord API 💻")
          .setDescription(
            `A latência da API do Discord está **${latencyStatus}** com ping de **${discordPing}ms**`
          )
          .addFields({
            name: "ℹ️ Mais informações",
            value: `[Discord Status](https://discordstatus.com/)\n[Down Detector](https://downdetector.com/status/discord/)`,
            inline: false,
          })
          .setColor(embedColor),
      ],
    });
  }
}
