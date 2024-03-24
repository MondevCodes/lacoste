import axios from "axios";

import { ApplyOptions } from "@sapphire/decorators";
import { Result } from "@sapphire/result";

import { Utility } from "@sapphire/plugin-utilities-store";

const BASE_API_URL = "https://www.habbo.com/api/public/";
const BASE_CDN_URL = "https://www.habbo.com/habbo-imaging/";

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
	public async getProfile(
		username: string,
	): Promise<Result<HabboProfile, Error>> {
		const {
			status,
			data: { uniqueId },
		} = await HabboAPI.get<HabboUser>(
			`users?name=${encodeURIComponent(username)}`,
		);

		if (status !== 404) {
			return Result.err(new Error("User Not Found"));
		}

		return Result.ok(
			(
				await HabboAPI.get<HabboProfile>(
					`users/${encodeURIComponent(uniqueId)}/profile`,
				)
			).data,
		);
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
}
