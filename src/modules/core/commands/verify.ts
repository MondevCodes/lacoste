import { EmbedBuilder, Message, Snowflake } from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";

import { ENVIRONMENT } from "$lib/env";
import { EmbedColors } from "$lib/constants/discord";

@ApplyOptions<Command.Options>({ name: "verificar" })
export default class SendCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		if (!message.inGuild()) {
			throw new Error("Cannot check permissions outside of a guild.");
		}

		const targetResult = await args.pickResult("string");
		if (targetResult.isErr()) return;

		const { habbo, member } =
			await this.container.utilities.habbo.inferTargetGuildMember(
				targetResult.unwrap(),
			);

		if (!habbo?.name || !member) {
			await message.reply({
				content:
					"Não consegui encontrar o perfil do usuário, talvez sua conta esteja deletada ou renomeada?",
			});

			return;
		}

		const currentSectorId =
			this.container.utilities.discord.inferHighestSectorRole(
				member.roles.cache.map((r) => r.id),
			);

		if (!currentSectorId) {
			await message.reply({
				content:
					"Não consegui encontrar o setor do usuário, talvez sua conta esteja deletada ou renomeada?",
			});

			return;
		}

		const currentSector = await message.guild.roles.fetch(currentSectorId);

		const currentJobId = this.container.utilities.discord.inferHighestJobRole(
			member.roles.cache.map((r) => r.id),
		);

		const currentJob = currentJobId
			? await message.guild.roles.fetch(currentJobId)
			: member.roles.highest;

		const databaseUser = await this.container.prisma.user.findUnique({
			where: { habboId: habbo.uniqueId },
			select: { latestPromotionDate: true },
		});

		await message.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle(`Verificação de ${habbo.name}`)
					.setFields([
						{
							name: "Setor // Cargo",
							value: `**${currentSector?.name}** // **${currentJob?.name}**`,
						},
						{
							name: "Ultima Promoção",
							value: databaseUser?.latestPromotionDate
								? new Date(
										databaseUser?.latestPromotionDate,
								  ).toLocaleDateString("pt-BR")
								: "N/D",
						},
						{
							name: "Promoção Disponível?",
							value: (await this.#isPromotionPossible(message, member.user.id))
								? "Sim"
								: "Não",
						},
					])
					.setFooter({
						text: message.author.tag,
						iconURL: message.author.displayAvatarURL(),
					})
					.setColor(EmbedColors.Default)
					.setThumbnail(
						`https://www.habbo.com/habbo-imaging/avatarimage?figure=${habbo.figureString}&size=b`,
					),
			],
		});
	}

	async #isPromotionPossible(
		message: Message,
		user: Snowflake,
	): Promise<boolean> {
		const guild =
			message.guild ??
			(await message.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		const target = await guild.members.fetch(user);
		const author = await guild.members.fetch(message.author.id);

		const userDb = await this.container.prisma.user.findUnique({
			where: {
				discordId: user,
			},
			select: {
				latestPromotionDate: true,
				latestPromotionRoleId: true,
			},
		});

		if (!userDb) {
			this.container.logger.warn(
				`Promotion for ${user} is possible because the user is not registered.`,
			);

			return true;
		}

		const targetJobRole =
			this.container.utilities.discord.inferHighestSectorRole(
				target.roles.cache.map((r) => r.id),
			);

		const authorJobRole =
			this.container.utilities.discord.inferHighestSectorRole(
				author.roles.cache.map((r) => r.id),
			);

		const targetJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
			(job) => job.id === targetJobRole,
		);

		const authorJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
			(job) => job.id === authorJobRole,
		);

		// const hasEnoughHierarchy =
		// 	(targetJob?.index ?? 0) >= (authorJob?.index ?? 0) &&
		// 	message.author.id !== user;

		const isNotSelfPromotion = message.author.id !== user;

		if (targetJob && authorJob && userDb.latestPromotionDate) {
			const currentDate = new Date();
			const daysSinceLastPromotion = Math.floor(
				(currentDate.getTime() - userDb.latestPromotionDate.getTime()) /
					(1000 * 3600 * 24),
			);

			const isEnoughDaysPassed =
				daysSinceLastPromotion >= targetJob.minDaysProm;

			return isEnoughDaysPassed;
		}

		return isNotSelfPromotion;
	}
}
