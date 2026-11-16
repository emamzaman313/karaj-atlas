import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { normalizeFa } from './normalize';

export type AtlasFeature = Feature<Geometry, Record<string, unknown>>;
export type AtlasFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;
export type SearchDocument = {
  feature: AtlasFeature;
  label: string;
  normalized: string;
  properties: Record<string, unknown>;
  tokens: string[];
};

const valueText = (value: unknown): string =>
  Array.isArray(value) ? value.map(valueText).join(' ') : String(value ?? '');
const normalize = (value: unknown): string =>
  normalizeFa(valueText(value)).replace(/[\u200c\u200d]/g, ' ').replace(/\s+/g, ' ').trim();

const nameFields = ['name:fa', 'name', 'name:en', 'official_name', 'alt_name', 'short_name'];
const addressFields = ['addr:street', 'addr:place', 'addr:housenumber', 'addr:suburb', 'addr:district', 'addr:city', 'addr:postcode'];
const kindFields = ['amenity', 'shop', 'tourism', 'historic', 'healthcare', 'public_transport', 'highway', 'building', 'leisure', 'office'];

export class AtlasSearchIndex {
  private documents: SearchDocument[] = [];

  build(collection: AtlasFeatureCollection): void {
    this.documents = collection.features.flatMap(feature => {
      const properties = feature.properties || {};
      if (!Object.keys(properties).length) return [];
      const label = String(properties['name:fa'] || properties.name || properties['name:en'] ||
        properties.amenity || properties.shop || properties.highway || properties.building ||
        properties['addr:street'] || 'عارضهٔ بدون نام');
      const normalized = normalize(Object.entries(properties).map(([key, value]) => key + ' ' + valueText(value)).join(' '));
      const tokens = Array.from(new Set(normalized.split(' ').filter(token => token.length > 1)));
      return [{ feature, label, normalized, properties, tokens }];
    });
  }

  search(query: string, mode: 'name' | 'address' | 'all' = 'all', limit = 30): SearchDocument[] {
    const q = normalize(query);
    if (q.length < 2) return [];
    const qTokens = q.split(' ').filter(Boolean);
    const ranked = this.documents.map(doc => {
      const name = normalize(nameFields.map(key => doc.properties[key]).filter(Boolean).join(' '));
      const address = normalize(addressFields.map(key => doc.properties[key]).filter(Boolean).join(' '));
      const kinds = normalize(kindFields.map(key => doc.properties[key]).filter(Boolean).join(' '));
      const target = mode === 'name' ? name : mode === 'address' ? address : doc.normalized;
      let score = target === q ? 120 : target.startsWith(q) ? 90 : target.includes(q) ? 65 : 0;
      if (mode === 'all' && score === 0) {
        const matched = qTokens.filter(token => doc.tokens.some(item => item.includes(token))).length;
        score = matched === qTokens.length ? 30 + matched * 5 : matched ? matched * 5 : 0;
      }
      if (mode === 'name' && name.includes(q)) score += 12;
      if (mode === 'address' && address.includes(q)) score += 12;
      if (kinds.includes(q)) score += 8;
      return { doc, score };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.label.localeCompare(b.doc.label, 'fa'));
    return ranked.slice(0, Math.max(1, limit)).map(item => item.doc);
  }

  get size(): number { return this.documents.length; }
}
