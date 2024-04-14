import axios from "axios";

import { Result } from "@sapphire/result";
import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import { Guild, GuildMember } from "discord.js";
import { ENVIRONMENT } from "$lib/env";

const BASE_API_URL = "https://www.habbo.com.br/api/public/";
const BASE_CDN_URL = "https://www.habbo.com.br/habbo-imaging/";

const HabboAPI = axios.create({ baseURL: BASE_API_URL });
const HabboCDN = axios.create({ baseURL: BASE_CDN_URL });

export interface HabboProfile {
	user: HabboUser;

	rooms: HabboRoom[];
	groups: HabboGroup[];
	badges: HabboBadge[];
	friends: HabboFriend[];
}

export interface HabboUser {
	uniqueId: string;

	name: string;
	motto: string;
	figureString: string;

	memberSince: string;
	lastAccessTime: string;

	online: boolean;
	profileVisible: boolean;

	starGemCount: number;
	totalExperience: number;

	currentLevel: number;
	currentLevelCompletePercent: number;

	selectedBadges: HabboSelectedBadge[];
}

export interface HabboRoom {
	id: number;
	uniqueId: string;

	name: string;
	description: string;
	showOwnerName: boolean;

	rating: number;
	maximumVisitors: number;

	ownerName: string;
	ownerUniqueId: string;

	imageUrl: string;
	thumbnailUrl: string;

	creationTime: string;
	habboGroupId?: string;

	tags: unknown[];
	categories: string[];
}

export interface HabboFriend {
	name: string;
	motto: string;
	online: boolean;
	uniqueId: string;
	figureString: string;
}

export interface HabboBadge {
	code: string;
	name: string;
	description: string;
}

export interface HabboGroup {
	id: string;
	online: boolean;

	name: string;
	description: string;

	type: string;
	isAdmin: boolean;

	roomId: string;
	badgeCode: string;

	primaryColour: string;
	secondaryColour: string;
}

export interface HabboSelectedBadge {
	name: string;
	description: string;

	code: string;
	badgeIndex: number;
}

@ApplyOptions<Utility.Options>({
	name: "habbo",
})
export class HabboUtility extends Utility {
	public async getProfile(username: string): Promise<Result<HabboUser, Error>> {
		let uniqueId: string = username;

		if (!username.startsWith("hhbr")) {
			const apiResult = await Result.fromAsync(
				HabboAPI.get<HabboUser>(`users?name=${encodeURIComponent(username)}`, {
					responseType: "json",
				}),
			);

			if (apiResult.isErr()) {
				return Result.err(new Error("User Not Found"));
			}

			const { data } = apiResult.unwrap();
			uniqueId = data.uniqueId;
		}

		const getResult = await Result.fromAsync(
			HabboAPI.get<HabboUser>(`users/${encodeURIComponent(uniqueId)}`),
		);

		if (getResult.isErr()) return Result.err(new Error("User Not Found"));
		return Result.ok(getResult.unwrap().data);
	}

	public async downloadFigure(figureString: string): Promise<Buffer> {
		return Buffer.from(
			(
				await HabboCDN.get(figureString, {
					responseType: "arraybuffer",
				})
			).data,
			"binary",
		);
	}

	#guild: Guild | undefined;

	/** Infers the target guild member from the target (Discord or Habbo). */
	public async inferTargetGuildMember(target: string): Promise<{
		member: GuildMember | undefined;
		habbo: HabboUser | undefined;
	}> {
		// const guild = await this.container.client.guilds.fetch(
		// 	ENVIRONMENT.GUILD_ID,
		// );

		this.#guild ??= await this.container.client.guilds.fetch(
			ENVIRONMENT.GUILD_ID,
		);

		if (!this.#guild) return { member: undefined, habbo: undefined };

		let habbo: HabboUser | undefined;
		let member: GuildMember | undefined;

		// if (target.startsWith("@")) {
		// 	member = (
		// 		await Result.fromAsync(
		// 			this.#guild.members.search({
		// 				query: target.replace(/@/g, ""),
		// 				limit: 1,
		// 			}),
		// 		)
		// 	)
		// 		.unwrapOr(undefined)
		// 		?.first();
		// }

		habbo = (await this.container.utilities.habbo.getProfile(target)).unwrapOr(
			undefined,
		);

		if (habbo && !member) {
			const userByHabboId = await this.container.prisma.user.findUnique({
				where: { habboId: habbo.uniqueId },
				select: { discordId: true },
			});

			if (userByHabboId?.discordId) {
				member = await this.#guild.members.fetch(userByHabboId?.discordId);
			}
		}

		if (member && !habbo) {
			const userByDiscordId = await this.container.prisma.user.findUnique({
				where: { discordId: member.id },
				select: { habboId: true },
			});

			if (userByDiscordId?.habboId) {
				habbo = (
					await this.container.utilities.habbo.getProfile(
						userByDiscordId?.habboId,
					)
				).unwrapOr(undefined);
			}
		}

		return { member, habbo };
	}
}
