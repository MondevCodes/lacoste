import { LogLevel } from "@sapphire/framework";

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
