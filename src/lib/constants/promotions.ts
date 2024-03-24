export const PROMOTIONS_DELAY_MS = {
	/** PT/BR -> Estagiário | 3 Days */
	Trainee: 259200000,

	/** PT/BR -> Líder de Modelos | 4 Days */
	ModelLeader: 345600000,

	/** PT/BR -> Supervisor | 6 Days */
	Supervisor: 518400000,

	/** PT/BR -> Coordenador | 7 Days */
	Coordinator: 604800000,

	/** PT/BR -> Sub Gerente | 8 Days */
	SubManager: 691200000,

	/** PT/BR -> Gerentes | 11 Days */
	Manager: 950400000,

	/** PT/BR -> Administrador | 12 Days */
	Administrator: 1036800000,

	/** PT/BR -> Adm. em Obs. | 12 Days */
	AdministratorObs: 1036800000,
} as const;

export type Promotion = keyof typeof PROMOTIONS_DELAY_MS;
export const PROMOTIONS = Object.keys(PROMOTIONS_DELAY_MS) as Promotion[];
