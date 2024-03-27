import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import type { Message } from "discord.js";

const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "CAM",
});

@ApplyOptions<Command.Options>({ name: "saldo" })
export class BallanceCommand extends Command {
	public override async messageRun(message: Message) {
		if (message.channel.isDMBased()) {
			const {
				_sum: { amount },
			} = await this.container.prisma.transaction.aggregate({
				where: { author: { discordId: message.author.id } },
				_sum: { amount: true },
			});

			await message.reply({
				content: `Seu saldo é de **${MONETARY_INTL.format(amount ?? 0)}**`,
			});
		}
	}
}
