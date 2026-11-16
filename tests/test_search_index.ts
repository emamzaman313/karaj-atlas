import { describe, expect, it } from 'vitest';
import { AtlasSearchIndex } from '../src/search';
const feature=(properties:Record<string,unknown>)=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[50.99,35.83]},properties});
describe('AtlasSearchIndex',()=>{
 it('normalizes Arabic/Persian letters and ranks exact name above partial',()=>{
  const index=new AtlasSearchIndex();index.build({type:'FeatureCollection',features:[feature({name:'مدرسه شهید'}) as never,feature({name:'مدرسه'}) as never]});
  expect(index.search('مدرسه', 'name',10)[0].label).toBe('مدرسه');
  expect(index.search('مدرسه', 'name',10)).toHaveLength(2);
 });
 it('searches address and amenity fields',()=>{
  const index=new AtlasSearchIndex();index.build({type:'FeatureCollection',features:[feature({'addr:street':'خیابان بهشتی',amenity:'school'}) as never]});
  expect(index.search('بهشتی','address')).toHaveLength(1);
  expect(index.search('school','all')).toHaveLength(1);
 });
 it('returns no hits for short queries',()=>{const index=new AtlasSearchIndex();index.build({type:'FeatureCollection',features:[]});expect(index.search('a')).toEqual([]);});
});
