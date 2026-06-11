import { Schema } from 'mongoose';
import { tenantContext } from './tenant.context';

export function tenantPlugin(schema: Schema) {
  // Only add tenantId if it doesn't already exist in the schema paths
  if (!schema.paths['tenantId']) {
    schema.add({ tenantId: { type: String, required: false, index: true } });
  }

  const queryMethods = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'update',
    'updateOne',
    'updateMany',
    'count',
    'countDocuments',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
    'findOneAndRemove',
    'distinct',
  ];

  queryMethods.forEach((method) => {
    schema.pre(method as any, async function () {
      const tenantId = tenantContext.getStore();
      const options = (this as any).getOptions();
      
      if (tenantId && !options.bypassTenant) {
        const stringTenantId = String(tenantId);
        const query = (this as any).getQuery();
        
        // Don't override if tenantId is already explicitly part of the query
        if (!query.tenantId) {
          (this as any).where({ tenantId: stringTenantId });
        }
      }
    });
  });
  
  schema.pre('aggregate', async function() {
    const tenantId = tenantContext.getStore();
    if (tenantId) {
      const stringId = String(tenantId);
      const pipeline = (this as any).pipeline();
      const firstStep = pipeline[0];
      
      // Don't unshift if the first step is already a $match on tenantId
      if (!firstStep || !firstStep.$match || !firstStep.$match.tenantId) {
        pipeline.unshift({ $match: { tenantId: stringId } });
      }
    }
  });

  schema.pre('validate', async function () {
    const tenantId = tenantContext.getStore();
    if (tenantId && !(this as any).tenantId) {
      (this as any).tenantId = String(tenantId);
    }
  });
}
