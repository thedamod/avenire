import * as Schema from "effect/Schema";

/**
 * An Effect Schema as a Standard Schema with JSON Schema, which the AI SDK accepts
 * as a tool's input or output schema. Both conversions annotate `schema` in place,
 * so pass a schema built for the tool, not a shared one.
 */
export const standardSchema = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema));
