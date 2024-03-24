import { z } from "zod";
import { LogLevel } from "@sapphire/framework";

import { TokenRegex } from "$lib/constants/regexes";

export const LOG_LEVEL = {
	Trace: LogLevel.Trace,
	Debug: LogLevel.Debug,
	Info: LogLevel.Info,
	Warn: LogLevel.Warn,
	Error: LogLevel.Error,
	Fatal: LogLevel.Fatal,
	None: LogLevel.None,
	"10": LogLevel.Trace,
	"20": LogLevel.Debug,
	"30": LogLevel.Info,
	"40": LogLevel.Warn,
	"50": LogLevel.Error,
	"60": LogLevel.Fatal,
	"100": LogLevel.None,
};

export type LogLevelObject = keyof typeof LOG_LEVEL;

const AuthorizedRoles = z.enum([
	"ESTAGIÁRIO",
	"LÍDER_DE_MODELOS",
	"SUPERVISOR",
	"COORDENADOR",
	"SUB_GERENTE",
	"GERENTE",
	"ADMINISTRADOR_EM_OBS",
	"ADMINISTRADOR",
]);

const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production"]),

	DISCORD_TOKEN: z.string().regex(TokenRegex),

	LOG_LEVEL: z
		.enum(Object.keys(LOG_LEVEL) as [LogLevelObject, ...LogLevelObject[]])
		.transform((value) => LOG_LEVEL[value]),

	AUTHORIZED_ROLES: z
		.string()
		.transform((str) => JSON.parse(str))
		.pipe(
			z.array(
				z.object({
					key: AuthorizedRoles,
					ids: z.array(z.string()),
					minimumTime: z.number(),
				}),
			),
		),
});

export const Environment = EnvSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	...process.env,
});

export type Env = z.infer<typeof EnvSchema>;

export const __DEV__ = process.env.NODE_ENV === "development";
export const __PROD__ = process.env.NODE_ENV === "production";
