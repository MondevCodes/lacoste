import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { type Message } from "discord.js";

@ApplyOptions<Command.Options>({
	name: "deleteAllEmpty",
})
export class LinkCommand extends Command {
	public override async messageRun(message: Message) {
    await this.container.prisma.transaction.deleteMany({
      where: {
        amount: 0,
      }
    });
    await this.container.prisma.user.deleteMany({
      where: {
        latestPromotionRoleId: null,
      }
    });

    await message.react("🗑️");
    await message.react("✅");

  }
}
