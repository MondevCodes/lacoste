import { z } from "zod";
import type { SpreadArray } from "$lib/types";

export function typedRecord<K extends string, T extends z.ZodTypeAny>(
	key: z.ZodEnum<SpreadArray<K>>,
	value: T,
) {
	return z.record(key, value);
}

export function enumKeys<
	K extends string,
	T extends Record<string, unknown> = Record<K, unknown>,
>(object: T) {
	return Object.keys(object) as [K, ...K[]];
}
