import { z } from "zod";
import { LogLevel } from "@sapphire/framework";

import { TokenRegex } from "$lib/constants/regexes";
import { enumKeys, typedRecord } from "$lib/helpers/zod-helpers";

import {
	Sectors,
	Systems,
	Snowflake,
	Committees,
} from "$lib/constants/schemas";

const OrderedSnowflake = z.object({
	index: z.number().default(0),
	id: Snowflake,
});

export type OrderedSnowflake = z.infer<typeof OrderedSnowflake>;

export const EnvironmentSchema = z.object({
	NODE_ENV: z.string().regex(TokenRegex),
	DISCORD_TOKEN: z.string().regex(TokenRegex),

	LOG_LEVEL: z
		.enum(enumKeys<keyof typeof LogLevel>(LogLevel))
		.transform((value) => LogLevel[value]),

	DEFAULT_ROLES: z.array(Snowflake),
	SECTORS_ROLES: typedRecord(Sectors, OrderedSnowflake),
	SYSTEMS_ROLES: typedRecord(Systems, OrderedSnowflake),
	COMMITTEES_ROLES: typedRecord(Committees, OrderedSnowflake),
});

export const __DEV__ = process.env.NODE_ENV === "development";
export const __PROD__ = process.env.NODE_ENV === "production";

export const ENVIRONMENT = EnvironmentSchema.parse(process.env);
