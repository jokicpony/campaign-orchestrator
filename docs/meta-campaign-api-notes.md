# Meta Campaign API - Technical Notes

## Open Questions / Future Improvements

### Ad Set Budget Sharing (`is_adset_budget_sharing_enabled`)
**Status**: Currently hardcoded to `false`

**Context**: Meta requires this field when not using Campaign Budget Optimization.

**Options to consider**:
- `true` = Enables 20% budget sharing between ad sets for better optimization
- `false` = Each ad set controls its own budget independently

**Recommendation to evaluate**:
```typescript
// Potential improvement: Enable for Standard (multiple ad sets), disable for ASC (single ad set)
is_adset_budget_sharing_enabled: campaignType === 'ASC' ? 'false' : 'true',
```

**Decision needed**: Should Standard campaigns enable budget sharing by default?

---

## API Reference Notes

### Campaign Creation (`/api/meta/campaign`)
- Uses Graph API v24.0 (centralized in src/lib/meta/constants.ts)
- Required fields: `name`, `objective`, `buying_type`, `is_adset_budget_sharing_enabled`
- ASC campaigns automatically set `objective: 'OUTCOME_SALES'`
- Deprecated: `special_ad_format` no longer used for ASC as of API v25+

### Ad Set Creation (`/api/meta/adset`)
- Budget is in cents (USD × 100)
- ASC campaigns don't need explicit targeting (handled automatically)
- Standard campaigns need `geo_locations` in targeting

### Flexible Ad Objective Restrictions
Only these objectives support flexible ads:
- `OUTCOME_SALES`
- `OUTCOME_APP_PROMOTION`
