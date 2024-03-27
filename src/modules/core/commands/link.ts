import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";
import type { Args } from "@sapphire/framework";

@ApplyOptions<Command.Options>({
	name: "vincular",
})
export class LinkCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		if (!message.inGuild()) {
			this.container.logger.warn(
				`[LinkCommand#messageRun] ${message.member?.id} tried to perform an action in a DM.`,
			);

			return;
		}

		const cachedGuild =
			message.guild ??
			(await this.container.client.guilds.fetch(message.guildId));

		const author =
			message.member ?? (await message.guild?.members.fetch(message.author.id));

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			category: "SECTOR",
			checkFor: "PROMOCIONAL",
			roles: author.roles,
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
				method: "reply",
			});

			return;
		}

		for await (const role of ENVIRONMENT.DEFAULT_ROLES) {
			await cachedGuild.members.addRole({
				user: member,
				role,
			});
		}

		await cachedGuild.members.addRole({
			user: member,
			role: ENVIRONMENT.JOBS_ROLES.ESTAGIÁRIO.id,
		});

		await cachedGuild.members.edit(member, {
			nick: `· ${profile.user.name}`,
		});

		await this.container.prisma.user.create({
			data: { habboId: profile.user.uniqueId, discordId: member.id },
		});

		const notificationChannel = await member.guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		const embed = new EmbedBuilder()
			.setColor(EmbedColors.Default)
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
