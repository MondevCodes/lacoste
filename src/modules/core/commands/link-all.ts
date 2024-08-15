import { EmbedBuilder, GuildMember, Message } from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

const BATCH_SIZE = 10;

@ApplyOptions<Command.Options>({
	name: "vincular-todos",
})
export class LinkAllCommand extends Command {
	public override async messageRun(message: Message) {
		if (!message.inGuild()) return;

		const notificationChannel = await message.guild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.HABBO_USERNAME_ADDED,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

		const guildMembers = await message.guild.members.fetch();

		const members = [...guildMembers.values()].filter(
			async (member) =>
				member.nickname?.startsWith("·") &&
				!(await this.#alreadyLinked(member)),
		);

		console.log(members.map((m) => m.nickname).sort());

		const batchMembers = this.#batchArray(members, BATCH_SIZE);

		for (const batch of batchMembers) {
			const batchEmbeds: EmbedBuilder[] = [];

			for await (const member of batch) {
				const nickname = member.nickname?.replace("·", "").trim();

				if (!nickname || nickname.length < 1) {
					continue;
				}

				const profileResult =
					await this.container.utilities.habbo.getProfile(nickname);

				if (profileResult.isErr()) {
					this.container.logger.warn(
						`${member.id} tried to link a user that does not exist.`,
					);

					continue;
				}

				const profile = profileResult.unwrap();

				this.container.logger.info(
					`${profile.uniqueId}: ${profile.name} -> ${member.user.tag}`,
				);

				const roles = (
					await member.guild.members.fetch(member.id)
				).roles.cache.map((role) => role.id);

				const highestJob =
					this.container.utilities.discord.inferHighestJobRole(roles);

				const highestSector =
					this.container.utilities.discord.inferHighestSectorRole(roles);

				const existingUser = await this.container.prisma.user.findUnique({
					where: { habboId: profile.uniqueId },
					select: { habboId: true, discordId: true },
				});

				if (existingUser) {
					continue;
				}

				for await (const role of ENVIRONMENT.DEFAULT_ROLES) {
					if (!member.roles.cache.has(role))
						await member.guild.members
							.addRole({
								user: member,
								role,
							})
							.catch(() => undefined);
				}

				if (!highestSector) {
          this.container.logger.error(
            `O usuário ${profile.name} não possui um setor`,
          );

					if (!highestJob)
            this.container.logger.error(
              `O usuário ${profile.name} não possui um cargo`,
            );
				}

				await member.guild.members
					.edit(member, {
						nick: `· ${profile.name}`,
					})
					.catch(() => {
						this.container.logger.warn(
							"[LinkCommand#messageRun] Failed to edit user nick.",
						);
					});

				await this.container.prisma.user.upsert({
					where: { discordId: member.id },
					update: { habboId: profile.uniqueId, habboName: profile.name },
					create: { habboId: profile.uniqueId, discordId: member.id, habboName: profile.name },
				});

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

				batchEmbeds.push(embed);
			}

			if (batchEmbeds.length !== 0)
				await notificationChannel.send({
					embeds: batchEmbeds,
				});

			this.container.logger.info(
				`[LinkAllCommand#link] Linked ${batch.length} users.`,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		await message.reply({
			content: "Todos os usuários foram vinculados com sucesso!",
		});

		return;
	}

	#batchArray<T>(array: T[], size: number) {
		return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
			array.slice(i * size, i * size + size),
		);
	}

	async #alreadyLinked(member: GuildMember) {
		const existingUser = await this.container.prisma.user.findUnique({
			where: { discordId: member.id },
		});

		return !!existingUser;
	}
}
