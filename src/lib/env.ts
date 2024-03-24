import { z } from "zod";

import { LOG_LEVEL, type LogLevelObject } from "$lib/constants/enums";
import { TokenRegex } from "$lib/constants/regexes";

const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production"]),

	DISCORD_TOKEN: z.string().regex(TokenRegex),

	LOG_LEVEL: z
		.enum(Object.keys(LOG_LEVEL) as [LogLevelObject, ...LogLevelObject[]])
		.transform((value) => LOG_LEVEL[value]),
});

export const Environment = EnvSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	...process.env,
});

export type Env = z.infer<typeof EnvSchema>;

export const __DEV__ = process.env.NODE_ENV === "development";
export const __PROD__ = process.env.NODE_ENV === "production";
