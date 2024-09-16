import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedBuilder, type Message } from "discord.js";
import type { Args } from "@sapphire/framework";

@ApplyOptions<Command.Options>({
	name: "vincularHabbo",
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
			this.container.logger.info(
				`[LinkCommand#messageRun] ${message.member?.id} tried to perform an action in a DM.`,
			);

			return;
		}

		const nickResult = await args.pickResult("string");

		if (nickResult.isErr()) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Comando inválido, use `vincularHabbo NickNoHabbo` deve ser usado para vincular um usuário.",
				method: "reply",
			});

			return;
		}

		const profileResult = await this.container.utilities.habbo.getProfile(
			nickResult.unwrap(),
		);

		if (profileResult.isErr()) {
			this.container.logger.info({
				err: profileResult.unwrapErr(),
			});

			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Parece que o usuário informado não existe, verifique o nome e tente novamente.",
				method: "reply",
			});

			return;
		}

		const profile = profileResult.unwrap();

		const existingUser = await this.container.prisma.user.findUnique({
			where: { habboId: profile.uniqueId },
			select: { habboId: true, discordId: true, latestPromotionRoleId: true },
		});

		if (existingUser) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Este usuário já está vinculado.",
				method: "reply",
			});

      return;
		} else {
			await this.container.prisma.user
			.create({
        data: {
            discordId: "0",
            habboId: profile.uniqueId,
            habboName: profile.name,
            latestPromotionDate: new Date(),
            latestPromotionRoleId: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
            latestPromotionJobId: ENVIRONMENT.JOBS_ROLES.VINCULADO.id,
          },
		  })
			.catch(() => undefined);
		}

		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_WITHOUT_DISCORD,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		const embed = new EmbedBuilder()
			.setColor(EmbedColors.Default)
			.setAuthor({
				name: `${existingUser ? "Revinculado" : "Vinculando"} por @${
					message.author.tag
				}`,
				iconURL: message.author.displayAvatarURL(),
			})
			.addFields([
				{ name: "Habbo", value: profile.name, inline: true },
				{ name: "Discord", value: "Ainda não vinculado", inline: true },
			])
			.setThumbnail(
				`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.figureString}&size=b&gesture=std`,
			);

		await notificationChannel.send({
			embeds: [embed],
		});

		await message.react("✅");
	}
}
