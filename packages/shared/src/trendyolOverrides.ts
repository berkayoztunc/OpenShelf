import { z } from "zod";

// ---------------------------------------------------------------- overrides accepted by the MCP draft / create tools

const Choice = z.object({ ids: z.array(z.number().int().positive()).max(50).optional(), custom: z.string().max(300).optional() });
export const TrendyolDraftOverrides = z.object({
  brandId: z.number().int().positive().optional(), brandName: z.string().max(200).optional(),
  categoryId: z.number().int().positive().optional(), categoryPath: z.string().max(400).optional(),
  title: z.string().max(100).optional(), description: z.string().max(30000).optional(), productMainId: z.string().max(40).optional(),
  cargo: z.string().max(60).optional(), vatRate: z.number().int().min(0).max(100).optional(),
  deliveryDuration: z.number().int().min(0).max(30).optional(), dimensionalWeight: z.number().positive().max(1000).optional(), origin: z.string().length(2).optional(),
  images: z.array(z.string().url().max(1000)).max(8).optional(),
  /** shared attributes: attributeId -> { ids | custom } */
  attrs: z.record(z.string().regex(/^\d{1,10}$/), Choice).optional(),
  /** per variant attributes: variantId -> attributeId -> { ids | custom } */
  variantAttrs: z.record(z.string().max(64), z.record(z.string().regex(/^\d{1,10}$/), Choice)).optional(),
  variants: z.array(z.object({
    variantId: z.string().max(64), include: z.boolean().optional(), barcode: z.string().max(40).optional(), stockCode: z.string().max(100).optional(),
    quantity: z.number().int().min(0).max(20000).optional(), listPrice: z.number().positive().optional(), salePrice: z.number().positive().optional(),
  })).max(200).optional(),
}).strict();
export type TrendyolDraftOverrides = z.infer<typeof TrendyolDraftOverrides>;

