export interface ToolParameterField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  allowedValues?: string;
  defaultValue?: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function formatSchemaType(schema: Record<string, unknown>): string {
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
  if (variants) return variants.map((item) => item && typeof item === "object" ? formatSchemaType(item as Record<string, unknown>) : "unknown").filter((value, index, values) => values.indexOf(value) === index).join(" | ");
  if (schema.const !== undefined) return formatValue(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.type === undefined) {
    return [...new Set(schema.enum.map((item) => item === null ? "null" : typeof item))].join(" | ");
  }
  const raw = schema.type;
  const type = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").join(" | ") : typeof raw === "string" ? raw : typeof schema.$ref === "string" ? schema.$ref.split("/").pop() ?? "object" : "unknown";
  if (type !== "array") return type;
  return `${schema.items && typeof schema.items === "object" ? formatSchemaType(schema.items as Record<string, unknown>) : "unknown"}[]`;
}

export function getToolParameterFields(parameters?: Record<string, unknown>): ToolParameterField[] {
  if (!parameters?.properties || typeof parameters.properties !== "object") return [];
  const required = new Set(Array.isArray(parameters.required) ? parameters.required.filter((item): item is string => typeof item === "string") : []);
  return Object.entries(parameters.properties as Record<string, unknown>).map(([name, value]) => {
    const schema = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      name,
      type: formatSchemaType(schema),
      description: typeof schema.description === "string" ? schema.description : undefined,
      required: required.has(name),
      allowedValues: Array.isArray(schema.enum) ? schema.enum.map(formatValue).join(", ") : undefined,
      defaultValue: schema.default === undefined ? undefined : formatValue(schema.default),
    };
  });
}
