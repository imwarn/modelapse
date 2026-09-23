import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const version = z.string().min(1).max(64);

export const TestCaseSchema = z
  .object({
    id: slug,
    type: z.enum(["icon", "public", "shadow", "fixture", "calibration"]),
    visibility: z.enum(["public", "private"]),
    status: z.enum(["active", "retired"]).default("active"),
    prompt: z.string().min(1).optional(),
    promptRef: z.string().min(1).optional(),
    fixtureBundleRef: z.string().min(1).optional(),
    activeFrom: z.string().datetime().optional(),
    activeTo: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.prompt && !value.promptRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A test case must define prompt or promptRef",
      });
    }
    if (value.type === "shadow" && value.status === "active" && value.visibility !== "private") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active shadow cases must be private; retire/declassify via a new case definition",
      });
    }
  });

export const TestPackSchema = z.object({
  apiVersion: z.literal("modelapse.dev/v1alpha1"),
  kind: z.literal("TestPack"),
  metadata: z.object({
    id: slug,
    version,
    name: z.string().min(1),
    description: z.string().optional(),
    origin: z.object({
      type: z.enum(["modelapse", "external", "hybrid"]),
      author: z.string().optional(),
      sourceUrl: z.string().url().optional(),
      license: z.string().nullable().optional(),
    }),
    tags: z.array(slug).default([]),
  }),
  spec: z.object({
    artifactType: z.enum([
      "text",
      "svg",
      "html",
      "web_bundle",
      "image",
      "video",
      "repo",
      "agent_trace",
    ]),
    runtimePolicy: slug,
    cases: z.array(TestCaseSchema).min(1),
    evaluator: z.object({
      id: slug,
      version,
      kind: z.enum(["deterministic", "structural", "visual", "judge", "hybrid"]),
    }),
    renderer: z
      .object({
        id: slug,
        version,
      })
      .optional(),
  }),
});

export type TestPack = z.infer<typeof TestPackSchema>;
export type TestPackCase = z.infer<typeof TestCaseSchema>;
