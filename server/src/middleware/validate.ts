import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = (err as any).issues || (err as any).errors || [];
        const formattedErrors = issues.map((i: any) => ({
          field: Array.isArray(i.path) ? i.path.join('.') : 'field',
          message: i.message
        }));
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
          code: 'VALIDATION_ERROR'
        });
      }
      next(err);
    }
  };
}


// Common Zod Schemas for Enterprise System
export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters')
});

export const intakeTicketSchema = z.object({
  customer_name: z.string().min(2, 'Customer name is required'),
  customer_phone: z.string().min(8, 'Valid phone number is required'),
  device_brand: z.string().min(2, 'Device brand is required'),
  device_model: z.string().min(2, 'Device model is required'),
  reported_defects: z.string().min(3, 'Reported defects description is required'),
  estimated_cost: z.number().optional(),
  labor_charge: z.number().optional()
});

export const quickSaleSchema = z.object({
  items: z.array(z.object({
    item_id: z.string(),
    quantity: z.number().min(1),
    unit_price: z.number().min(0)
  })).min(1, 'At least one item is required in cart'),
  payment_method: z.enum(['CASH', 'CARD', 'WALLET', 'SPLIT']).default('CASH')
});
