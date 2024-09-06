import {
	InteractionHandler,
	InteractionHandlerTypes,
	Result,
} from "@sapphire/framework";

import {
	time,
	Role,
	Snowflake,
	ButtonStyle,
	EmbedBuilder,
	TextInputStyle,
	TextInputBuilder,
	ButtonInteraction,
	RepliableInteraction,
	GuildMemberRoleManager,
} from "discord.js";

import { find, values } from "remeda";
import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";
import { getJobSectorsById } from "$lib/constants/jobs";

type InGuild = "cached" | "raw";

const MAX_PROMOTABLE_UNREGISTERED_ROLES =
	ENVIRONMENT.JOBS_ROLES.SUPERVISOR.index;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PromotionInteractionHandler extends InteractionHandler {
	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.match("LCST::PromotionInteractionHandler")) {
			return this.none();
		}

		if (!interaction.inGuild()) {
			this.container.logger.warn(
				`[PromotionInteractionHandler#parse] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return this.none();
		}

		const { members } =
			interaction.guild ??
			(await interaction.client.guilds.fetch(interaction.guildId));

		const { roles } =
			"toJSON" in interaction.member
				? interaction.member
				: await members.fetch(interaction.user.id);

		const isAuthorized = this.container.utilities.discord.hasPermissionByRole({
			checkFor: "PROMOCIONAL",
			category: "SECTOR",
			roles,
		});

		return isAuthorized ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction<InGuild>) {
		const { interaction: interactionFromModal, result } =
			await this.container.utilities.inquirer.awaitModal(interaction, {
				title: "Promover",
				listenInteraction: true,

				inputs: [
					new TextInputBuilder()
						.setCustomId("target")
						.setLabel("Promovido (Discord ou Habbo)")
						.setPlaceholder("Informe ID do Discord (@Nick) ou do Habbo (Nick).")
						.setStyle(TextInputStyle.Short)
						.setRequired(true),

					new TextInputBuilder()
						.setCustomId("additional")
						.setLabel("Deseja adicionar alguma observação?")
						.setPlaceholder("Se desejar, adicione informações extras aqui.")
						.setStyle(TextInputStyle.Short)
						.setRequired(true),
				],
			});

		const inferredTargetResult = await Result.fromAsync(
			this.container.utilities.habbo.inferTargetGuildMember(result.target),
		);

		if (inferredTargetResult.isErr()) {
			await interactionFromModal.editReply({
				content: "||P93N|| Houve um erro inesperado, contate o desenvolvedor.",
			});

			this.container.logger.error(
				`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not in the server.`,
				{ error: inferredTargetResult.unwrapErr() },
			);

			return;
		}

		const { member: targetMember, habbo: targetHabbo } =
			inferredTargetResult.unwrapOr({ member: undefined, habbo: undefined });

		if (!targetMember) {
			const isHabboTarget = result.target.startsWith("@");

			this.container.logger.info(
				`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not in the server.`,
				{ isHabboTarget },
			);

			await interactionFromModal.editReply({
				content: !isHabboTarget
					? "||P108N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o ID do Discord, ele(a) deve estar no servidor)."
					: "||P107N|| Não foi possível encontrar o usuário informado neste servidor (para mencionar usuários com o nickname do Habbo, ele(a) deve estar registrado(a) com `vincular`).",
			});

			return;
		}

		const currentTargetJob = this.#inferHighestJobRole(targetMember.roles);

    this.container.logger.info(
      `[PromotionInteractionHandler#run] CurrentTargetJob #inferHighestJobRole: ${currentTargetJob}`,
    );

		if (!currentTargetJob) {
			await interactionFromModal.editReply({
				content:
					"||WP120|| Não foi possível encontrar o atual cargo do usuário, você tem certeza que ele(a) possui um cargo hierárquico? Se não, contate o desenvolvedor.",
			});

			this.container.logger.info(
				`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they don't have a job.`,
			);

			return;
		}

		// Next Job
		// Next Job

		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(interaction.guildId));

		const jobRolesChoices = await Promise.all(
			values(ENVIRONMENT.JOBS_ROLES).map(
				async (value) =>
					value.id &&
					(guild.roles.cache.get(value.id) ??
						(await guild.roles.fetch(value.id))),
			),
		);

		const [nextTargetJobId] =
			await this.container.utilities.inquirer.awaitSelectMenu(
				interactionFromModal,
				{
					choices: [
						{
							id: "AUTO",
							label: "Automático",
							description: "Infere o próximo cargo na lista.",
							emoji: "🤖",
						},
						...jobRolesChoices.filter(Boolean).map((role) => ({
							id: role.id,
							label: role.name,
						})),
					],
					placeholder: "Selecionar",
					question: "Selecione o cargo que deseja promover.",
				},
			);

		// Authorized
		// Authorized



		// Infer Roles
		// Infer Roles

		let nextTargetJob: any;

		if (nextTargetJobId === "AUTO")
			nextTargetJob = this.#inferNextJobRole(
				targetMember.roles,
				currentTargetJob,
			);
		else
			nextTargetJob =
				guild.roles.cache.get(nextTargetJobId) ??
				(await guild.roles.fetch(nextTargetJobId));

    this.container.logger.info(
    `[PromotionInteractionHandler#run]
      nextTargetJob: ${nextTargetJob}, \n
      nextTargetJobId: ${nextTargetJobId}, \n
    `,
    );

		if (!nextTargetJob) {
			await interactionFromModal.editReply({
				content:
					"||P132N|| O usuário selecionado já está no ápice possível em que você pode promover. Se não, contate o desenvolvedor.",
			});

			this.container.logger.info(
				`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`,
				{ nextTargetJobId, previousTargetJobId: currentTargetJob.id },
			);

			return;
		}

    const [isPromotionPossible, registrationType] =
    await this.#isPromotionPossible(interactionFromModal, targetMember.id, nextTargetJob.id);

    this.container.logger.info(
      `[PromotionInteractionHandler#run] isPromotionPossible: ${isPromotionPossible}`,
    );

    if (!isPromotionPossible) {
      await interactionFromModal.editReply({
        content:
          // "Você não pode promover este usuário, pois ele já possui um cargo de maior autoridade permitido para realizar promoções.",
          `Você não pode promover este usuário para o cargo ${nextTargetJob}, pois o cargo é superior ao que você possui`,
      });

      this.container.logger.info(
        `[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`,
      );

      return;
    }

		// Check Cooldown
		// Check Cooldown

		const existingUser = await this.container.prisma.user.findUnique({
			where: {
				discordId: targetMember.user.id,
			},
			select: {
				id: true,
				latestPromotionDate: true,
				latestPromotionRoleId: true,
			},
		});

		const authorizedHigherRoleId = this.#isTargetRoleInferior(
			"SUPERVISOR",
			nextTargetJob.id,
		);

		this.container.logger.info(
			`[PromotionInteractionHandler#run/${interaction.id}] ${interaction.user.tag} tried to promote ${result.target} but failed because they are not authorized to promote.`,
			{ authorizedHigherRoleId },
		);

		if (!existingUser && !authorizedHigherRoleId) {
			await interactionFromModal.editReply({
				content:
					"||WP157|| Usuário não encontrado na base de dados, use `vincular`.",
			});

			return;
		}

		let shouldPromote =
			/** isFirstPromotion */
			!existingUser?.latestPromotionRoleId ||
			!existingUser?.latestPromotionDate;

		if (!shouldPromote) {
			const latestPromotionDate =
				existingUser?.latestPromotionDate &&
				new Date(existingUser?.latestPromotionDate);

			const minDaysProm = find(
				values(ENVIRONMENT.JOBS_ROLES),
				(x) => x.id === existingUser?.latestPromotionRoleId,
			)?.minDaysProm;

			if (latestPromotionDate && minDaysProm) {
				const daysSinceLastPromotion = Math.floor(
					(new Date().getTime() - latestPromotionDate.getTime()) /
						(1000 * 3600 * 24),
				);

				shouldPromote = daysSinceLastPromotion >= minDaysProm;

				if (!shouldPromote) {
					await interactionFromModal.editReply({
						content: `||WP158|| O usuário tem que aguardar pelo menos ${
							minDaysProm - daysSinceLastPromotion
						} dia para poder promover o cargo.`,
					});

					return;
				}
			}
		}

		// Confirmation
		// Confirmation

		const isConfirmed = await this.container.utilities.inquirer.awaitButtons(
			interactionFromModal,
			{
				choices: [
					{
						id: "true",
						label: "Sim",
						style: ButtonStyle.Success,
					},
					{
						id: "false",
						label: "Não",
						style: ButtonStyle.Danger,
					},
				] as const,
				question: {
					embeds: [
						new EmbedBuilder()
							.setTitle("Promover")
							.setDescription(
								`Promover <@${targetMember.user.id}> para ${nextTargetJob}?`,
							)
							.setThumbnail(
								`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`,
							)
							.setColor(EmbedColors.Default),
					],
				},
			},
		);

		if (isConfirmed.result === "false") {
      await interactionFromModal
      .deleteReply()
      .catch(() =>
        this.container.logger.error("[PromotionInteractionHandler] Couldn't delete reply."),
      );;

			return;
		}

		// Promotion
		// Promotion

			const nextSectorRoleKey = getJobSectorsById(nextTargetJob.id);
			const previousSectorRoleKey = getJobSectorsById(currentTargetJob.id);

			const nextSectorRole =
				nextSectorRoleKey &&
				(await guild.roles.fetch(
					ENVIRONMENT.SECTORS_ROLES[nextSectorRoleKey].id,
				));

			const previousSectorRole =
				previousSectorRoleKey &&
				(await guild.roles.fetch(
					ENVIRONMENT.SECTORS_ROLES[previousSectorRoleKey].id,
				));

			await Promise.all([
				targetMember.roles.add(nextTargetJob.id),
				targetMember.roles.remove(currentTargetJob.id),

				nextSectorRole &&
					guild.members.addRole({
						user: targetMember.id,
						role: nextSectorRole,
					}),

				previousSectorRole?.id !== nextSectorRole?.id &&
					previousSectorRole &&
					guild.members.removeRole({
						user: targetMember.id,
						role: previousSectorRole,
					}),
			]);

      this.container.logger.info(
        `[PromotionInteractionHandler#run]
        existingUser: ${existingUser}, \n
        nextSectorRoleName: ${nextSectorRole?.name}, \n
        nextSectorRoleId: ${nextSectorRole?.id}, \n
        nextTargetJobName: ${nextTargetJob}, \n
        nextTargetJobId: ${nextTargetJobId}`,
      );

			if (existingUser && nextSectorRole)

				await this.container.prisma.user.update({
					where: {
						id: existingUser.id,
					},
					data: {
						latestPromotionDate: new Date(),
						latestPromotionRoleId: nextSectorRole.id,
					},
				});

		const notificationChannel = await this.container.client.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.DEPARTMENT_PROMOTIONS,
		);

		const authorResult =
			registrationType === "REGISTERED" &&
			(await Result.fromAsync(
				this.container.utilities.habbo.inferTargetGuildMember(
					`@${interaction.user.tag}`,
					true,
				),
			));

		let habboName: string | undefined = undefined;

		if (authorResult) {
			const { habbo: authorHabbo } = authorResult.unwrapOr({
				member: undefined,
				habbo: undefined,
			});

			habboName = authorHabbo?.name ?? "N/A";
		}

		if (notificationChannel?.isTextBased()) {
			await notificationChannel.send({
				embeds: [
					new EmbedBuilder()
						.setDescription(
							`### Promoção de ${targetHabbo?.name ?? `@${targetMember.user.tag}`}\n\n`,
						)
						.setAuthor({
							name: interaction.user.tag,
							iconURL: interaction.user.displayAvatarURL(),
						})
						.addFields([
              {
                name: "👤 Promotor ",
                value: `${habboName ?? `@${interaction.user.tag}`}`,
              },
							{
								name: "🗓️ Promovido Em",
								value: time(new Date(), "F"),
								inline: true,
							},
							{
								name: "📅 Última Promoção",
								value: existingUser?.latestPromotionDate
									? time(existingUser.latestPromotionDate, "F")
									: "N/A",
								inline: true,
							},
							{
								name: "📝 Cargo Anterior",
								value: currentTargetJob.toString(),
								inline: false,
							},
							{
								name: "📗 Cargo Promovido",
								value: nextTargetJob.toString(),
							},
              {
                name: "🗒️ Observação",
                value: result.additional.length > 0
                ? result.additional
                : "Nenhuma observação foi adicionada.",
              }
						])
						.setColor(EmbedColors.Success)
						.setThumbnail(
							`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}&size=b`,
						),
				],
			});
		}

		await interactionFromModal.editReply({
			content: "✅ Operação concluída.",
			embeds: [],
			components: [],
		});
	}

	// Private Methods
	// Private Methods

	async #isPromotionPossible(
		interaction: RepliableInteraction,
		user: Snowflake,
    selectedJob: Snowflake,
	): Promise<[boolean, "REGISTERED" | "UNREGISTERED"]> {
		const guild =
			interaction.guild ??
			(await interaction.client.guilds.fetch(ENVIRONMENT.GUILD_ID));

		// const target = await guild.members.fetch(user);
		const author = await guild.members.fetch(interaction.user.id);

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

			return [true, "REGISTERED"];
		}

		// const targetJobRole =
		// 	this.container.utilities.discord.inferHighestJobRole(
		// 		target.roles.cache.map((r) => r.id),
		// 	);

		const authorJobRole =
			this.container.utilities.discord.inferHighestJobRole(
				author.roles.cache.map((r) => r.id),
			);

		const targetJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
			(job) => job.id === selectedJob
		);

		const authorJob = Object.values(ENVIRONMENT.JOBS_ROLES).find(
			(job) => job.id === authorJobRole,
		);

    this.container.logger.info(
      `[PromotionInteractionHandler#isPromotionPossible] \n
      targetJobSelected: ${selectedJob} \n
      targetJobIndex: ${targetJob?.index} \n
      authorJobRole: ${authorJobRole} \n
      authorJobIndex: ${authorJob?.index} \n
      `,
    );

		const hasEnoughHierarchy =
			(targetJob?.index ?? 0) < (authorJob?.index ?? 0) &&
			interaction.user.id !== user;

    this.container.logger.info(
      `[PromotionInteractionHandler#isPromotionPossible] hasEnoughHierarchy: ${hasEnoughHierarchy}`,
    );

		const isNotSelfPromotion = interaction.user.id !== user;

		const isAuthorizedUnregistered =
			targetJob?.index ?? 0 <= MAX_PROMOTABLE_UNREGISTERED_ROLES;

		if (!isAuthorizedUnregistered) {
			return [true, "UNREGISTERED"];
		}

		if (targetJob && authorJob && userDb.latestPromotionDate) {
			const currentDate = new Date();
			const daysSinceLastPromotion = Math.floor(
				(currentDate.getTime() - userDb.latestPromotionDate.getTime()) /
					(1000 * 3600 * 24),
			);

			const isEnoughDaysPassed =
				daysSinceLastPromotion >= targetJob.minDaysProm;

			return [
				isEnoughDaysPassed && isNotSelfPromotion && hasEnoughHierarchy,
				"REGISTERED",
			];
		}

    this.container.logger.info(
      `[PromotionInteractionHandler#isPromotionPossible] hasEnoughHierarchy: ${hasEnoughHierarchy}`,
    );

		return [isNotSelfPromotion && hasEnoughHierarchy, "REGISTERED"];
	}

	#inferHighestJobRole(roles: GuildMemberRoleManager) {
		const jobRoles = roles.cache.filter((role) =>
			Object.values(ENVIRONMENT.JOBS_ROLES).some((r) => r.id === role.id),
		);

		if (jobRoles.size === 0) return null;

		return jobRoles.reduce((highest, current) => {
			const currentIndex =
				Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === current.id)
					?.index ?? 0;

			const highestIndex =
				Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === highest.id)
					?.index ?? 0;

			if (!currentIndex || !highestIndex) {
				return current;
			}

			return currentIndex > highestIndex ? current : highest;
		});
	}

	#inferNextJobRole(roles: GuildMemberRoleManager, currentRole: Role) {
		const currentRoleSearch =
			Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r.id === currentRole.id)

		if (!currentRoleSearch) return null;
    if (!roles) return null;

		const nextRole = Object.values(ENVIRONMENT.JOBS_ROLES)
			.sort((a, b) => a.index - b.index)
			.find((role) => role.index > currentRoleSearch.index);

    this.container.logger.info(
      `[PromotionInteractionHandler#inferNextJobRole] \n
      currentRole: ${currentRole} \n
      currentRoleSearch: ${currentRoleSearch} \n
      nextRole: ${nextRole} \n
      `,
      );

		return nextRole;
	}

	#isTargetRoleInferior(
		maxRole: keyof typeof ENVIRONMENT.JOBS_ROLES,
		targetRoleId: string,
	) {
		const jobsRoles = Object.values(ENVIRONMENT.JOBS_ROLES);

		const maxRoleIndex =
			jobsRoles[Object.keys(jobsRoles).findIndex((key) => key === maxRole)]
				?.index;

		const targetRoleIndex =
			jobsRoles[Object.keys(jobsRoles).findIndex((key) => key === targetRoleId)]
				?.index;

		return targetRoleIndex && targetRoleIndex < maxRoleIndex;
	}
}
