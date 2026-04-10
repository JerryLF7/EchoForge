import fs from "node:fs";
import path from "node:path";

const schemaCache = new Map();

export function assertValidAgainstSchema(repoRoot, schemaName, value, label = schemaName) {
  const schema = loadSchema(repoRoot, schemaName);
  const errors = [];

  validateNode(schema, value, "$", errors);

  if (errors.length > 0) {
    throw new Error(
      `${label} does not match ${schemaName}: ${errors.slice(0, 5).join("; ")}`,
    );
  }
}

function loadSchema(repoRoot, schemaName) {
  const cacheKey = `${repoRoot}:${schemaName}`;
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey);
  }

  const schemaPath = path.join(repoRoot, "schemas", schemaName);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  schemaCache.set(cacheKey, schema);
  return schema;
}

function validateNode(schema, value, currentPath, errors) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }

  if (schema.oneOf) {
    validateOneOf(schema.oneOf, value, currentPath, errors);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && !deepEqual(value, schema.const)) {
    errors.push(`${currentPath} must equal ${stringifyValue(schema.const)}`);
    return;
  }

  if (schema.enum && !schema.enum.some((entry) => deepEqual(value, entry))) {
    errors.push(`${currentPath} must be one of ${schema.enum.map(stringifyValue).join(", ")}`);
    return;
  }

  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${currentPath} must be ${describeType(schema.type)}`);
    return;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${currentPath} must have length >= ${schema.minLength}`);
    }

    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) {
      errors.push(`${currentPath} must match ${schema.pattern}`);
    }

    if (schema.format && !matchesFormat(schema.format, value)) {
      errors.push(`${currentPath} must match format ${schema.format}`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${currentPath} must be >= ${schema.minimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${currentPath} must have at least ${schema.minItems} items`);
    }

    if (schema.items) {
      value.forEach((item, index) => {
        validateNode(schema.items, item, `${currentPath}[${index}]`, errors);
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = schema.properties || {};

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(`${currentPath}.${key} is required`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateNode(propertySchema, value[key], `${currentPath}.${key}`, errors);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${currentPath}.${key} is not allowed`);
        }
      }
    }
  }
}

function validateOneOf(options, value, currentPath, errors) {
  let validCount = 0;
  const nestedErrors = [];

  for (const option of options) {
    const optionErrors = [];
    validateNode(option, value, currentPath, optionErrors);
    if (optionErrors.length === 0) {
      validCount += 1;
      continue;
    }

    nestedErrors.push(optionErrors[0]);
  }

  if (validCount !== 1) {
    errors.push(`${currentPath} must match exactly one allowed shape (${nestedErrors.join("; ")})`);
  }
}

function matchesType(expected, value) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => matchesSingleType(type, value));
}

function matchesSingleType(expected, value) {
  switch (expected) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isPlainObject(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

function matchesFormat(format, value) {
  if (format === "date-time") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) &&
      !Number.isNaN(Date.parse(value));
  }

  if (format === "uri") {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.protocol && parsed.hostname);
    } catch {
      return false;
    }
  }

  return true;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function describeType(type) {
  return Array.isArray(type) ? type.join(" or ") : type;
}

function stringifyValue(value) {
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}
