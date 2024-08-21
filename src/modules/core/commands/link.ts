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
			this.container.logger.info(
				`[LinkCommand#messageRun] ${message.member?.id} tried to perform an action in a DM.`,
			);

			return;
		}

		const memberResult = await args.pickResult("member");
		const nickResult = await args.pickResult("string");

		if (memberResult.isErrAnd(() => nickResult.isErr())) {
			await this.container.utilities.discord.sendEphemeralMessage(message, {
				content:
					"Comando inválido, use `vincular NickNoHabbo @NickNoDiscord` deve ser usado para vincular um usuário.",
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

		const member = memberResult.unwrap();
		const profile = profileResult.unwrap();

		const roles = (
			await message.guild.members.fetch(member.id)
		).roles.cache.map((role) => role.id);

		const existingUser = await this.container.prisma.user.findUnique({
			where: { habboId: profile.uniqueId },
			select: { habboId: true, discordId: true, latestPromotionRoleId: true },
		});

		const highestJob =
			this.container.utilities.discord.inferHighestJobRole(roles);

		const highestSector =
			this.container.utilities.discord.inferHighestSectorRole(roles);

		for await (const role of ENVIRONMENT.DEFAULT_ROLES) {
			await cachedGuild.members
				.addRole({
					user: member,
					role,
				})
				.catch(() => undefined);
		}

    this.container.logger.info(
      `Sector = ${highestSector}`,
      `Job = ${highestJob}`,
    );
		if (!highestSector || !existingUser?.latestPromotionRoleId) {
			await cachedGuild.members
				.addRole({
					user: member,
					role: ENVIRONMENT.SECTORS_ROLES.INICIAL.id,
				})
				.catch(() => undefined);
			this.container.logger.info(
			"Sector Inicial role Added"
			);

			if (!highestJob || !existingUser?.latestPromotionRoleId)
				await cachedGuild.members
					.addRole({
						user: member,
						role: ENVIRONMENT.JOBS_ROLES.ESTAGIÁRIO.id,
					})
					.catch(() => undefined);

			if (existingUser) {
				await this.container.prisma.user.update({
					where: {
					habboId: profile.uniqueId,
					},
					data: {
					latestPromotionDate: new Date(),
					latestPromotionRoleId: ENVIRONMENT.JOBS_ROLES.ESTAGIÁRIO.id,
					},

				});
			}

			this.container.logger.info(
				"Job Estagiário role Added"
			);
		}

		await cachedGuild.members
			.edit(member, {
				nick: `· ${profile.name}`,
			})
			.catch(() => {
				this.container.logger.warn(
					"[LinkCommand#messageRun] Failed to edit user nick.",
				);
			});

		if (existingUser) {
			await this.container.prisma.user
				.update({
					where: { discordId: existingUser.discordId },
					data: { habboId: profile.uniqueId, habboName: profile.name },
				})
				.catch(() => undefined);
		} else {
			await this.container.prisma.user
				.create({
					data: { habboId: profile.uniqueId, discordId: member.id, habboName: profile.name, latestPromotionDate: new Date(), latestPromotionRoleId: ENVIRONMENT.JOBS_ROLES.ESTAGIÁRIO.id },
				})
				.catch(() => undefined);
		}

		const notificationChannel = await member.guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED,
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
				{ name: "Discord", value: `<@${member.id}>`, inline: true },
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
