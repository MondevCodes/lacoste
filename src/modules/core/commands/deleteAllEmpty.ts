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
        amount: { lte: 0 },
      }
    });
    await this.container.prisma.user.deleteMany({
      where: {
        OR: [
          { latestPromotionRoleId: null },
          { latestPromotionRoleId: { isSet: false } }
        ]
      }
    });

    await message.react("🗑️");
    await message.react("✅");

  }
}
