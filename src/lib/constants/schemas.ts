import { z } from "zod";
import { SnowflakeRegex } from "./regexes";

export const Json = z
	.string()
	.transform((value) => tryCatch(() => JSON.parse(value), z.NEVER));

export const Snowflake = z.string().regex(SnowflakeRegex);

// Enums

export const Sectors = z.enum([
	"SISTEMA",
	"EXCLUSIVOS",
	"FEDERAÇÃO",
	"FUNDAÇÃO",
	"PRESIDÊNCIA",
	"DIRETORIA",
	"ADMINISTRATIVO",
	"PROMOCIONAL",
	"AVALIATIVO",
	"INICIAL",
]);

export type Sector = z.infer<typeof Sectors>;

export const Committees = z.enum([
	"LÍDER_PROMOCIONAL",
	"LÍDER_ORGANIZACIONAL",
	"LÍDER_AVALIATIVO",
	"AJUDANTE_PROMOCIONAL",
	"AJUDANTE_ORGANIZACIONAL",
	"AJUDANTE_AVALIATIVO",
]);

export type Committee = z.infer<typeof Committees>;

export const Systems = z.enum([
	"AFASTADO15",
	"AFASTADO30",
	"RENOVADO15",
	"RENOVADO30",
]);

export type System = z.infer<typeof Systems>;

export const Jobs = z.enum([
	"DONO",
	"SUB_DONO",

	"FUNDADOR",
	"APRENDIZ_DE_FUNDADOR",
	"LÍDER_DA_PRESIDÊNCIA",
	"PRESIDENTE",
	"VICE_PRESIDENTE",
	"LÍDER_DE_DIRETORIA",
	"DIRETOR_DE_DESIGN",
	"DIRETOR_GERAL",
	"DIRETOR_DE_RH",
	"APRENDIZ_DE_DIRETOR",
	"SUPERINTENDENTE",
	"INTENDENTE",

	"ADMINISTRADOR",
	"ADMINISTRADOR_EM_OBS",
	"GERENTE",
	"SUB_GERENTE",
	"COORDENADOR",
	"SUPERVISOR",
	"LÍDER_DE_MODELO",
	"ESTAGIÁRIO",
  "VINCULADO",
]);

export type Job = z.infer<typeof Jobs>;

export const NotificationChannels = z.enum([
	"TICKETS",
	"CMB_LOGS",
	"APPROVAL_REQUEST",

	"FORM_FIRE",
	"FORM_HIRE",
	"FORM_NOTES",
	"FORM_WARNINGS",
	"FORM_FOLLOWUP",
	"FORM_ANALYTICS",
	"FORM_INTERVIEW",
	"FORM_COMPLAINT",
	"FORM_EVALUATION",
	"FORM_SUGGESTION",
	"FORM_ORGANIZATIONAL",

	"HABBO_USERNAME_ADDED",
	"HABBO_USERNAME_CHANGED",

	"DEPARTMENT_RETURN",
	"DEPARTMENT_DEMOTION",
	"DEPARTMENT_PROMOTIONS",
  "DIARY_ORGANIZATIONAL",
]);

export type NotificationChannel = z.infer<typeof NotificationChannels>;

// Utils

/** Tries to execute a function and executes a fallback if it throws. */
function tryCatch<T>(fn: () => T, cb: () => T): T {
	try {
		return fn();
	} catch {
		return cb();
	}
}
