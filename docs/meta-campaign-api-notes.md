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
- Uses Graph API v25.0 (centralized in src/lib/meta/constants.ts; the transcode Cloud Function pins its own copy)
- Required fields: `name`, `objective`, `buying_type`, `is_adset_budget_sharing_enabled`
- ASC campaigns automatically set `objective: 'OUTCOME_SALES'`
- Legacy ASC/AAC creation (`smart_promotion_type`) was removed in v25.0; the ASC toggle creates a standard `OUTCOME_SALES` campaign
- Special ad categories: `FINANCIAL_PRODUCTS_SERVICES` (replaced `CREDIT`, Jan 2025), `EMPLOYMENT`, `HOUSING`, `ISSUES_ELECTIONS_POLITICS`; campaigns also send `special_ad_category_country`

### Ad Set Creation (`/api/meta/adset`)
- Budget is in cents (USD × 100)
- ASC campaigns don't need explicit targeting (handled automatically)
- Standard campaigns need `geo_locations` in targeting
- Housing/Employment/Financial ad sets: no age/gender targeting, and an explicit `targeting_automation.advantage_audience` (required on all versions from Oct 27, 2026)

### Flexible Ad Objective Restrictions
Only these objectives support flexible ads:
- `OUTCOME_SALES`
- `OUTCOME_APP_PROMOTION`
