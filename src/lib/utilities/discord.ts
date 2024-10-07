import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import { ENVIRONMENT } from "$lib/env";

import type {
	Guild,
	GuildMember,
	GuildMemberRoleManager,
	Message,
	MessageEditOptions,
	MessagePayload,
	MessageReplyOptions,
	Role,
} from "discord.js";

import type { Committee, Sector, System, Job } from "$lib/constants/schemas";
export type Category = "SECTOR" | "SYSTEM" | "COMMITTEE" | "JOB";

export type Roles<T extends Category> = T extends "SECTOR"
	? Sector
	: T extends "SYSTEM"
	  ? System
    : T extends "JOB"
    ? Job
	  : T extends "COMMITTEE"
		  ? Committee
		  : never;

export type DiscordEphemeralReplyOptions =
	| ({ method?: "reply"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageReplyOptions
	  ))
	| ({ method?: "edit"; deleteIn?: number } & (
			| string
			| MessagePayload
			| MessageEditOptions
	  ));

export type DiscordHasPermissionOptions<
	T extends Category = Category,
	U extends Roles<T> = Roles<T>,
> = {
	category: T;
	checkFor: U;

	/** Behavior for checking if the user has a higher role than the required. */
	exact?: boolean;
};

const ROLES_ORDER = {
	COMMITTEE: ENVIRONMENT.COMMITTEES_ROLES,
	SECTOR: ENVIRONMENT.SECTORS_ROLES,
	SYSTEM: ENVIRONMENT.SYSTEMS_ROLES,
  JOB: ENVIRONMENT.JOBS_ROLES,
} satisfies Record<Category, object>;

@ApplyOptions<Utility.Options>({
	name: "discord",
})
export class DiscordUtility extends Utility {
	/**
	 * Sends a normal message and deletes it after a certain amount of time.
	 * @param message Message object to send/edit the message.
	 * @param options Options to send/edit the message.
	 * @example
	 * ```ts
	 * await this.container.utilities.discord.sendEphemeralMessage(message, {
	 *   method: 'reply',
	 *   content: 'Hello World!'
	 * });
	 *
	 * // => Sends a message with the content "Hello World!" and deletes it after 30 (default) seconds.
	 * ```
	 */
	public async sendEphemeralMessage(
		message: Message,
		options: DiscordEphemeralReplyOptions,
	) {
		let messageSent: Message;

		if (options.method === "reply") messageSent = await message.reply(options);
		else messageSent = await message.edit(options as MessageEditOptions);

		setTimeout(async () => {
			if (messageSent.deletable) {
				await messageSent.delete();
			} else {
				this.container.logger.warn(
					"[Utilities/DiscordUtility] Message not deletable.",
					{ id: messageSent.id, author: messageSent.author.id },
				);
			}
		}, options.deleteIn ?? 15_000);
	}

	/**
	 * Infer the highest sector role from a list of roles.
	 * @returns The highest sector role from the list if it exists, otherwise `null`.
	 *
	 * @example
	 * ```ts
	 * const roles = new GuildMemberRoleManager(member);
	 * const highestRole = this.#inferHighestSectorRole(roles);
	 *
	 * // => Role { id: '123456789012345678' }
	 * ```
	 */
	public inferHighestSectorRole(roles: string[]) {
		const sectorRoles = roles.filter((role) =>
			Object.values(ENVIRONMENT.SECTORS_ROLES).some((r) => r?.id === role),
		);

		if (sectorRoles.length === 0) return null;

		return sectorRoles.reduce((highest, current) => {
			const currentIndex =
				Object.values(ENVIRONMENT.SECTORS_ROLES).find((r) => r?.id === current)
					?.index ?? 0;

			const highestIndex =
				Object.values(ENVIRONMENT.SECTORS_ROLES).find((r) => r?.id === highest)
					?.index ?? 0;

			if (!currentIndex || !highestIndex) {
				return current;
			}

			return currentIndex > highestIndex ? current : highest;
		});
	}

	public inferHighestJobRole(roles: string[]) {
		const jobRoles = roles.filter((role) =>
			Object.values(ENVIRONMENT.JOBS_ROLES).some((r) => r?.id === role),
		);

		if (jobRoles.length === 0) return null;

		return jobRoles.reduce((highest, current) => {
			const currentIndex =
				Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r?.id === current)
					?.index ?? 0;

			const highestIndex =
				Object.values(ENVIRONMENT.JOBS_ROLES).find((r) => r?.id === highest)
					?.index ?? 0;

			if (!currentIndex || !highestIndex) {
				return current;
			}

			return currentIndex > highestIndex ? current : highest;
		});
	}

	/**
	 * Infer the next sector role from a list of roles, given a current role.
	 * @param currentRole The current role.
	 * @param roles The list of roles to search through.
	 * @returns The next sector role greater than the current role, or `null` if none exists.
	 */
	public inferNextSectorRole(currentRole: Role, roles: GuildMemberRoleManager) {
		const currentRoleIndex =
			Object.values(ENVIRONMENT.SECTORS_ROLES).find(
				(r) => r.id === currentRole.id,
			)?.index ?? 0;

		if (!currentRoleIndex) return null;

		const nextRole = Object.values(ENVIRONMENT.SECTORS_ROLES)
			.sort((a, b) => a.index - b.index)
			.find((role) => role.index > currentRoleIndex);

		return nextRole ? roles.cache.find((r) => r.id === nextRole.id) : null;
	}

	/**
	 * Checks if the user has the required permissions.
	 * @param message Message object to check for permissions.
	 * @param options Object containing the category and role to check for.
	 * @returns Boolean indicating whether the user has the required permissions.
	 */
	public hasPermissionByRole<T extends Category>(
		options: DiscordHasPermissionOptions<T> & {
			/** Member's roles object manager to check. */
			roles: GuildMemberRoleManager;
		},
	) {
		const exactRole: { id: string; index: number } =
			// @ts-ignore
			ROLES_ORDER[options.category]?.[options.checkFor];

		if (!exactRole) return false;

		const foundExactRole = options.roles.cache.some(
			(x) => x.id === exactRole.id,
		);

		if (foundExactRole) return foundExactRole;

		const higherRoles = Object.values(
			ROLES_ORDER[options.category] ?? {},
		).filter((x) => x.index >= (exactRole.index ?? 0) && x.id !== exactRole.id);

		return higherRoles.some((x) => options.roles.cache.has(x.id));
	}

	/**
	 * Adds default roles to the member.
	 * @param member Member to add default roles to.
	 *
	 * @example
	 * ```ts
	 * await this.container.utilities.discord.addDefaultRoles(message);
	 * ```
	 */
	public async addDefaultRoles(member: GuildMember) {
		await member.roles.add(ENVIRONMENT.DEFAULT_ROLES).catch((error) => {
			this.container.logger.error(
				"[Utilities/DiscordUtility] Could not add default roles.",
				{ error },
			);
		});
	}

	#guild: Guild | null = null;

	/**
	 * Gets the guild object.
	 * @returns Guild object.
	 *
	 * @example
	 * ```ts
	 * const guild = await this.container.utilities.discord.getGuild();
	 * ```
	 */
	public async getGuild() {
		if (!this.#guild) {
			this.#guild = await this.container.client.guilds.fetch(
				ENVIRONMENT.GUILD_ID,
			);
		}

		return this.#guild;
	}
}
