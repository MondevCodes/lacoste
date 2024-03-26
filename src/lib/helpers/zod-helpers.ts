import { z } from "zod";
import type { SpreadArray } from "$lib/types";

export function typedRecord<K extends string, T extends z.ZodType>(
	key: z.ZodEnum<SpreadArray<K>>,
	type: T,
) {
	return z
		.string()
		.transform((value) => JSON.parse(value))
		.transform((value) => {
			if (typeof value !== "object" || value === null) {
				return z.NEVER;
			}

			for (const item of Object.values(value)) {
				const isValid = type.safeParse(item).success;
				if (!isValid) return z.NEVER;
			}

			return key._def.values.reduce(
				(agg, k) => ({
					// biome-ignore lint/performance/noAccumulatingSpread: Required to be spread.
					...agg,
					[k]: value[k as keyof typeof value],
				}),
				{} as { [P in K]: z.infer<T> },
			);
		});
}

export function enumKeys<
	K extends string,
	T extends Record<string, unknown> = Record<K, unknown>,
>(object: T) {
	return Object.keys(object) as [K, ...K[]];
}
