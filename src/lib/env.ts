import { z } from "zod";
import { LogLevel } from "@sapphire/framework";

import { TokenRegex } from "$lib/constants/regexes";
import { enumKeys, typedRecord } from "$lib/helpers/zod-helpers";

import {
	Sectors,
	Systems,
	Snowflake,
	Committees,
	NotificationChannels,
	Jobs,
} from "$lib/constants/schemas";

const OrderedSnowflake = z.object({
	index: z.number().default(0),
	id: Snowflake,
});

export type OrderedSnowflake = z.infer<typeof OrderedSnowflake>;

export const EnvironmentSchema = z.object({
	NODE_ENV: z.enum(["development", "production"]),
	DISCORD_TOKEN: z.string().regex(TokenRegex),

	LOG_LEVEL: z
		.enum(enumKeys<keyof typeof LogLevel>(LogLevel))
		.transform((value) => LogLevel[value]),

	GUILD_ID: Snowflake,
	TICKETS_CATEGORY: Snowflake,

	JOBS_ROLES: typedRecord(
		Jobs,
		OrderedSnowflake.extend({
			minDaysProm: z.number().default(0),
		}),
	),
	JOBS_PAYMENT: typedRecord(Jobs, z.number().default(0)),

	SECTORS_ROLES: typedRecord(Sectors, OrderedSnowflake),
	SYSTEMS_ROLES: typedRecord(Systems, OrderedSnowflake),
	COMMITTEES_ROLES: typedRecord(Committees, OrderedSnowflake),

	DEFAULT_ROLES: z
		.string()
		.transform((value) => JSON.parse(value))
		.refine(
			(value): value is string[] =>
				Array.isArray(value) &&
				value.length > 0 &&
				value.every((role) => typeof role === "string"),
			{
				message: "Must have at least one role.",
			},
		),

	NOTIFICATION_CHANNELS: typedRecord(NotificationChannels, Snowflake),
});

export const __DEV__ = process.env.NODE_ENV === "development";
export const __PROD__ = process.env.NODE_ENV === "production";

export const ENVIRONMENT = EnvironmentSchema.parse(process.env);
