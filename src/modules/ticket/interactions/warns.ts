import {
	InteractionHandler,
	InteractionHandlerTypes, Result,
} from "@sapphire/framework";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
} from "discord.js";

import { ApplyOptions } from "@sapphire/decorators";

import { EmbedColors } from "$lib/constants/discord";
import { ENVIRONMENT } from "$lib/env";

export type Action = "Request" | "Approve" | "Reject";

export const BASE_BUTTON_ID = "LCST::WarningsInteractionHandler";
export const BASE_BUTTON_ID_REGEX = new RegExp(`^${BASE_BUTTON_ID}/`);

/** @internal @see {@link decodeButtonId} */
export function encodeButtonId(action: Action) {
	return `${BASE_BUTTON_ID}/${action}`;
}

/** @internal @see {@link encodeButtonId} */
export function decodeButtonId(id: string): Action {
	return id.replace(`${BASE_BUTTON_ID}/`, "") as Action;
}

type ParsedData = { action: Action };

const MODAL_INPUTS_OBJ = {
	Target: new TextInputBuilder()
		.setLabel("Avisado (Discord ou Habbo)")
		.setPlaceholder("Informe ID do Discord (@Nick) ou do Habbo (Nick).")
		.setStyle(TextInputStyle.Short)
		.setCustomId("Target")
		.setRequired(true),

	Content: new TextInputBuilder()
		.setStyle(TextInputStyle.Paragraph)
		.setLabel("Descrição da Advertência")
		.setPlaceholder("Ex.: Má conduta em excesso")
		.setCustomId("Content")
		.setRequired(true),
} satisfies Record<string, TextInputBuilder | "GENERATED">;

const MODAL_INPUTS = Object.values(MODAL_INPUTS_OBJ);
type ModalInput = keyof typeof MODAL_INPUTS_OBJ;

let habboTargetStorage: string | undefined;
let habboInteractionName: string | undefined = undefined;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class WarningsInteractionHandler extends InteractionHandler {
	async #isAuthorized(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) {
			this.container.logger.warn(
				`[WarningsInteractionHandler#isAuthorized] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return false;
		}

		const { roles } =
			interaction.member ??
			(await interaction.guild.members.fetch(interaction.user.id));

		switch (decodeButtonId(interaction.customId)) {
			case "Request":
				return this.container.utilities.discord.hasPermissionByRole({
					checkFor: "INICIAL",
					category: "SECTOR",
					roles,
				});

			case "Reject":
			case "Approve":
				return this.container.utilities.discord.hasPermissionByRole({
					checkFor: "PRESIDÊNCIA",
					category: "SECTOR",
					roles,
				});

			default:
				throw new Error("Invalid Action");
		}
	}

	public override async parse(interaction: ButtonInteraction) {
		if (!interaction.customId.match(BASE_BUTTON_ID_REGEX)) return this.none();
		if (!(await this.#isAuthorized(interaction))) return this.none();

		return this.some({ action: decodeButtonId(interaction.customId) });
	}

	#APPROVAL_ROW = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeButtonId("Approve"))
			.setStyle(ButtonStyle.Success)
			.setLabel("Aprovar"),

		new ButtonBuilder()
			.setCustomId(encodeButtonId("Reject"))
			.setStyle(ButtonStyle.Danger)
			.setLabel("Reprovar"),
	);

	public override async run(
		interaction: ButtonInteraction,
		{ action }: ParsedData,
	) {
		if (!interaction.inGuild()) {
			this.container.logger.warn(
				`[WarningsInteractionHandler#run] ${interaction.user.tag} tried to perform an action in a DM.`,
			);

			return;
		}

		const cachedGuild =
			interaction.guild ??
			(await this.container.client.guilds.fetch(interaction.guildId));

		if (action === "Request") {
			const { result, interaction: modalInteraction } =
				await this.container.utilities.inquirer.awaitModal<ModalInput>(
					interaction,
					{
						listenInteraction: true,
						inputs: MODAL_INPUTS,
						title: "Advertência",
					},
				);

			const { member: targetMember, habbo: targetHabbo } =
				await this.container.utilities.habbo.inferTargetGuildMember(
					result.Target,
				);

			if (!targetMember) {
				await modalInteraction.editReply({
					content: "Não foi possível encontrar o usuário informado.",
				});

				return;
			}

			const targetUserId = await this.container.prisma.user.findUnique({
				where: { discordId: targetMember.id },
				select: { id: true, discordId: true },
			});

			if (!targetUserId) {
				await modalInteraction.reply({
					content:
						"Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
					ephemeral: true,
				});

				return;
			}

			const targetUser = await cachedGuild.members.fetch(
				targetUserId.discordId,
			);

			if (!targetUser) {
				await modalInteraction.reply({
					content:
						"Não consegui encontrar o perfil do colaborador, tem certeza que ele está registrado no servidor?",
					ephemeral: true,
				});
			}

			const approvalChannel = await cachedGuild.channels.fetch(
				ENVIRONMENT.NOTIFICATION_CHANNELS.APPROVAL_REQUEST,
			);

			if (!approvalChannel?.isTextBased()) {
				throw new Error("Can't send message to non-text channel.");
			}

			const highestJobRoleId =
				this.container.utilities.discord.inferHighestJobRole(
					targetUser.roles.cache.map((r) => r.id),
				);

      habboTargetStorage = targetHabbo?.name;

      const authorResult =
      (await Result.fromAsync(
        this.container.utilities.habbo.inferTargetGuildMember(
          `@${interaction.user.tag}`,
          true,
        ),
      ));

      if (authorResult) {
        const { habbo: authorHabbo } = authorResult.unwrapOr({
          member: undefined,
          habbo: undefined,
         });

        habboInteractionName = authorHabbo?.name ?? "N/A";
      }

			const approvalEmbed = new EmbedBuilder()
				.setTitle(`Solicitação de Advertência para ${targetHabbo?.name}`)
				.setColor(EmbedColors.Default)
				.setAuthor({
					name: interaction.user.tag,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.addFields([
					{
						name: "👤 Autor",
						value: `${habboInteractionName ?? `@${interaction.user.tag}`}`,
					},
					{
						name: "📗 Cargo do Colaborador",
						value: highestJobRoleId
							? (await targetMember.guild.roles.fetch(highestJobRoleId))
									?.name ?? "N/A"
							: "N/A",
					},
					{
						name: "🗒️ Advertência",
						value: result.Content,
					},
				])
				.setThumbnail(
					`https://www.habbo.com/habbo-imaging/avatarimage?figure=${targetHabbo?.figureString}`,
				)

			await approvalChannel.send({
				embeds: [approvalEmbed],
				components: [this.#APPROVAL_ROW],
				content: `<@&${ENVIRONMENT.SECTORS_ROLES.PRESIDÊNCIA.id}>`,
			});

			await modalInteraction.editReply({
				content: "Solicitação enviada.",
			});

			return;
		}

		// ---------------------
		// -  Handle Approval  -
		// ---------------------

		if (action === "Reject") {
			await interaction.message.edit({
				components: [],
				embeds: [
					EmbedBuilder.from(interaction.message.embeds[0])
						.setTitle("❌ Advertência Rejeitada")
						.setColor(EmbedColors.Error),
				],
			});

			await interaction.followUp({
				content: "❌ Rejeitada.",
				ephemeral: true,
			});

			return;
		}

		const notificationChannel = await cachedGuild.channels.fetch(
			ENVIRONMENT.NOTIFICATION_CHANNELS.FORM_NOTES,
		);

		if (!notificationChannel?.isTextBased()) {
			throw new Error("Can't send message to non-text channel.");
		}

    const authorResult =
    (await Result.fromAsync(
      this.container.utilities.habbo.inferTargetGuildMember(
        `@${interaction.user.tag}`,
        true,
      ),
    ));

    if (authorResult) {
      const { habbo: authorHabbo } = authorResult.unwrapOr({
        member: undefined,
        habbo: undefined,
       });

      habboInteractionName = authorHabbo?.name ?? "N/A";
    }

		await notificationChannel.send({
			embeds: [
				EmbedBuilder.from(interaction.message.embeds[0])
					.setTitle(`Advertência para ${habboTargetStorage}`)
					.addFields([{ name: "🛡️ Autorizado Por", value: `${habboInteractionName ?? `@${interaction.user.tag}`}` }])
					.setColor(EmbedColors.Error),
			],
		});

		await interaction.message.edit({
			components: [],
			embeds: [
				EmbedBuilder.from(interaction.message.embeds[0])
					.setTitle("✅ Advertência Aprovada")
					.setColor(EmbedColors.Success),
			],
		});

		await interaction.reply({
			content: "✅ Operação concluída.",
			ephemeral: true,
		});

		return;
	}
}
