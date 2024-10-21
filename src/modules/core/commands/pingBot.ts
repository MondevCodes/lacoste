import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";

@ApplyOptions<Command.Options>({
  name: "pingBot",
})
export class pingBot extends Command {
  public override async messageRun(message: Message) {
    const botPing = Math.round(this.container.client.ws.ping);

    let latencyStatus: string | undefined;
    let embedColor: string | EmbedColors = EmbedColors.Default;

    if (botPing <= 50)
      (latencyStatus = "Boa"), (embedColor = EmbedColors.AddAmount);
    else if (botPing > 50 && botPing <= 100)
      (latencyStatus = "Moderada"), (embedColor = EmbedColors.Alert);
    else if (botPing > 100 && botPing <= 200)
      (latencyStatus = "Ruim"), (embedColor = EmbedColors.RemoveAmount);
    else if (botPing > 200)
      (latencyStatus = "Muito ruim"), (embedColor = EmbedColors.Error);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Latência do Bot 🤖")
          .setDescription(
            `A latência do Bot está **${latencyStatus}** com ping de **${botPing}ms**\n ${ENVIRONMENT.JOBS_ROLES.ADMINISTRADOR.id}`
          )
          .setColor(embedColor),
      ],
    });
  }
}
