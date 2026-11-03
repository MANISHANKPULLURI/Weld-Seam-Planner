import { z } from "zod";
import { weldJobSchema } from "./weldJob.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const schema = z.toJSONSchema(weldJobSchema, { target: "draft-7" } as never);

await mkdir(join(import.meta.dir, "../../../schema"), { recursive: true });

await writeFile(join(import.meta.dir, "../../../schema/weld-job.schema.json"), JSON.stringify(schema, null, 2));

console.log("Generated backend/schema/weld-job.schema.json");
