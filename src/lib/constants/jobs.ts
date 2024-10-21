import { ENVIRONMENT } from "$lib/env";
import { keys } from "remeda";

ENVIRONMENT.JOBS_ROLES;
ENVIRONMENT.SECTORS_ROLES;

type Job = keyof typeof ENVIRONMENT.JOBS_ROLES;
type Sector = Exclude<
	keyof typeof ENVIRONMENT.SECTORS_ROLES,
	"EXCLUSIVOS" | "SISTEMA"
>;

export const JOBS_SECTORS = {
	ADMINISTRATIVO: [
		"ADMINISTRADOR",
		"ADMINISTRADOR_EM_OBS",
		"INTENDENTE",
		"SUPERINTENDENTE",
	],
	DIRETORIA: [
		"APRENDIZ_DE_DIRETOR",
		"DIRETOR_DE_RH",
		"DIRETOR_GERAL",
	],
	FEDERAÇÃO: ["DONO", "SUB_DONO"],
	PROMOCIONAL: ["SUB_GERENTE", "GERENTE"],
	AVALIATIVO: ["SUPERVISOR", "COORDENADOR"],
	INICIAL: ["VINCULADO", "ESTAGIÁRIO", "LÍDER_DE_MODELO"],
	PRESIDÊNCIA: ["PRESIDENTE", "VICE_PRESIDENTE"],
	FUNDAÇÃO: ["LÍDER_DA_PRESIDÊNCIA", "APRENDIZ_DE_FUNDADOR", "FUNDADOR"],
} as const;

export function getJobSectors(job: Job) {
	return keys(JOBS_SECTORS).find((k) =>
		JOBS_SECTORS[k as Sector].includes(job),
	) as Sector | undefined;
}

export function getJobSectorsById(id: string) {
	const key = Object.keys(ENVIRONMENT.JOBS_ROLES).find(
		(k) => ENVIRONMENT.JOBS_ROLES[k as Job]?.id === id,
	);

	return getJobSectors(key as Job);
}
