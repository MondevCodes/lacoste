import { z } from "zod";
import type { SpreadArray } from "$lib/types";

export function typedRecord<K extends string, T extends z.ZodTypeAny>(
	key: z.ZodEnum<SpreadArray<K>>,
	value: T,
) {
	return z.object(
		key._def.values.reduce(
			(agg, k) => ({
				// biome-ignore lint/performance/noAccumulatingSpread: Required to be spread.
				...agg,
				[k]: value.optional(),
			}),
			{} as Record<K, T>,
		),
	);
}

export function enumKeys<
	K extends string,
	T extends Record<string, unknown> = Record<K, unknown>,
>(object: T) {
	return Object.keys(object) as [K, ...K[]];
}
