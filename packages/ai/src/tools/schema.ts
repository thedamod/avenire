import * as Schema from "effect/Schema";

/**
 * An Effect Schema as a Standard Schema with JSON Schema, which the AI SDK accepts
 * as a tool's input or output schema. Both conversions annotate `schema` in place,
 * so pass a schema built for the tool, not a shared one.
 */
export const standardSchema = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema));

/** Object unions still need an explicit root type for OpenAI-compatible tool transports. */
export const standardObjectSchema = <S extends Schema.Codec<unknown, unknown>>(schema: S) => {
  const result = standardSchema(schema);
  const json = result["~standard"].jsonSchema;
  const input = json.input.bind(json);
  Object.assign(json, {
    input: (options: Parameters<typeof input>[0]) => ({ ...input(options), type: "object" }),
  });
  return result;
};
