import { zodToJsonSchema } from "zod-to-json-schema";
import { weldJobSchema } from "./schemas/weldJob.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";


const schema = zodToJsonSchema(weldJobSchema, { target: "jsonSchema7" });

await mkdir(join(import.meta.dir, "../schema"), { recursive: true });

await writeFile(join(import.meta.dir, "../schema/weld-job.schema.json"), JSON.stringify(schema, null, 2));
