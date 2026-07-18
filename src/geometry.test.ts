import { describe,expect,it } from 'vitest';
import { geometryForBlock,geometryKind } from './geometry';

function bounds(state:string){const g=geometryForBlock(state);g.computeBoundingBox();const b=g.boundingBox!;return {min:[b.min.x,b.min.y,b.min.z],max:[b.max.x,b.max.y,b.max.z]}}

describe('procedural block geometry',()=>{
  it('places bottom and top slabs in the correct half',()=>{expect(bounds('minecraft:stone_slab[type=bottom]').max[1]).toBe(0);expect(bounds('minecraft:stone_slab[type=top]').min[1]).toBe(0)});
  it('builds compound stairs',()=>{const g=geometryForBlock('minecraft:oak_stairs[facing=north,half=bottom,shape=inner_left]');expect(g.attributes.position.count).toBeGreaterThan(24)});
  it('extends fences above a normal cube',()=>expect(bounds('minecraft:oak_fence[north=true,south=true,east=false,west=false]').max[1]).toBe(1));
  it('recognises common non-cube families',()=>{expect(geometryKind('minecraft:glass_pane')).toBe('pane');expect(geometryKind('minecraft:oak_door')).toBe('door');expect(geometryKind('minecraft:poppy')).toBe('plant')});
});
