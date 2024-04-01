import { ApplyOptions } from "@sapphire/decorators";
import { Command, type Args } from "@sapphire/framework";

import type { Message } from "discord.js";

export const MONETARY_INTL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "CAM",
	minimumFractionDigits: 0,
});

@ApplyOptions<Command.Options>({ name: "saldo" })
export class BalanceCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		const user = (await args.pickResult("member")).unwrapOr(message.author);

		const {
			_sum: { amount },
		} = await this.container.prisma.transaction.aggregate({
			where: { user: { discordId: user.id } },
			_sum: { amount: true },
		});

		await this.container.utilities.discord.sendEphemeralMessage(message, {
			content:
				user.id === message.author.id
					? `Seu saldo é de **${MONETARY_INTL.format(amount ?? 0)}**`
					: `<@${user.id}> tem **${MONETARY_INTL.format(amount ?? 0)}**`,
			method: "reply",
		});
	}
}
