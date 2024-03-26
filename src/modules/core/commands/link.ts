import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import type { Args } from "@sapphire/framework";
import { EmbedBuilder, type Message } from "discord.js";

@ApplyOptions<Command.Options>({
	name: "vincular",
})
export class LinkCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		if (!message.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const memberToCheck =
			message.member ?? (await message.guild?.members.fetch(message.author.id));

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			category: "SECTOR",
			checkFor: "PROMOCIONAL",
			roles: memberToCheck.roles,
		});

		if (!isAuthorized) {
			return;
		}

		const memberResult = await args.pickResult("member");
		const nickResult = await args.pickResult("string");

		if (memberResult.isErrAnd(() => nickResult.isErr())) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Comando inválido, use `vincular NickNoHabbo @NickNoDiscord` deve ser usado para vincular um usuário.",
			});

			return;
		}

		const profileResult = await this.container.utilities.habbo.getProfile(
			nickResult.unwrap(),
		);

		if (profileResult.isErr()) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Parece que o usuário informado não existe, verifique o nome e tente novamente.",
			});

			return;
		}

		const member = memberResult.unwrap();
		const profile = profileResult.unwrap();

		const existingUser = await this.container.prisma.user.findUnique({
			where: { habboId: profile.user.uniqueId },
			select: { habboId: true, discordId: true },
		});

		if (existingUser) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content: `O usuário informado ja está vinculado com <@${existingUser.discordId}>.`,
			});

			return;
		}

		await member.roles.add(ENVIRONMENT.DEFAULT_ROLES);

		await this.container.prisma.user.create({
			data: { habboId: profile.user.uniqueId, discordId: member.id },
		});

		const notificationChannel = await member.guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED,
		);

		if (notificationChannel?.isTextBased()) {
			const embed = new EmbedBuilder()
				.setColor(EmbedColors.Info)
				.setAuthor({
					name: `Vinculado por @${message.author.tag}`,
					iconURL: message.author.displayAvatarURL(),
				})
				.addFields([
					{ name: "Habbo", value: profile.user.name, inline: true },
					{ name: "Discord", value: `<@${member.id}>`, inline: true },
				])
				.setThumbnail(
					`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.user.figureString}&size=b&gesture=std`,
				);

			await notificationChannel.send({
				embeds: [embed],
			});
		}
	}
}
