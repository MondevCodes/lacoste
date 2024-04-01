import axios from "axios";

import { Result } from "@sapphire/result";
import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";

import { GuildMember } from "discord.js";
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

	/** Infers the target guild member from the target (Discord or Habbo). */
	public async inferTargetGuildMember(target: string) {
		const guild = await this.container.client.guilds.fetch(
			ENVIRONMENT.GUILD_ID,
		);

		let habbo: HabboUser | undefined;
		let member: GuildMember | undefined;

		if (target.startsWith("@")) {
			member = (
				await guild.members.search({
					query: target.replace(/@/g, ""),
					limit: 1,
				})
			).first();

			if (member) {
				const databaseUser = await this.container.prisma.user.findUnique({
					where: { discordId: member.id },
					select: { habboId: true },
				});

				if (databaseUser?.habboId)
					habbo = (
						await this.container.utilities.habbo.getProfile(
							databaseUser?.habboId,
						)
					).unwrapOr(undefined);
			}
		} else {
			habbo = (
				await this.container.utilities.habbo.getProfile(target)
			).unwrapOr(undefined);

			if (!habbo) return { member, habbo };

			const databaseUser = await this.container.prisma.user.findUnique({
				where: { habboId: habbo.uniqueId },
				select: { discordId: true },
			});

			if (!databaseUser) return { member, habbo };
			member = await guild.members.fetch(databaseUser.discordId);
		}

		return { member, habbo };
	}
}
