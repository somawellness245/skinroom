/**
 * Featured professional lines estheticians can add to their shelf in one tap.
 * Products are read live from the brand's Shopify store; `lastsWeeks` fills in
 * how long each product typically lasts (matched by the product's store handle).
 */
export type BrandCatalog = {
  id: string;
  name: string;
  tagline: string;
  store: string;
  lastsWeeks: Record<string, number>;
  defaultWeeks?: number;
};

export const BRAND_CATALOGS: BrandCatalog[] = [
  {
    id: 'soma',
    name: 'SOMA',
    tagline: 'Professional skincare from We Are Soma Wellness',
    store: 'wearesomawellness.com',
    // TODO(Frankie): add each product's handle and typical weeks of use, e.g. 'gentle-cleanser': 8
    lastsWeeks: {},
  },
];
