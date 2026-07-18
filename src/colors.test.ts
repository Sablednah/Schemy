import { describe,expect,it } from 'vitest';
import { colorFor,isFallbackColor } from './colors';

describe('block colours',()=>{
  it('colours stone variants rather than using magenta',()=>{for(const name of ['granite','polished_granite','calcite','diorite','andesite'])expect(isFallbackColor(`minecraft:${name}`)).toBe(false)});
  it('inherits wood species colours for shaped blocks',()=>{expect(colorFor('minecraft:spruce_slab')).toBe(colorFor('minecraft:spruce_fence'));expect(isFallbackColor('minecraft:oak_trapdoor')).toBe(false)});
  it('hides non-rendering technical blocks',()=>{expect(colorFor('minecraft:barrier')).toBe(0);expect(colorFor('minecraft:light[level=15]')).toBe(0)});
  it('recognises plants and recent luminous blocks',()=>{expect(isFallbackColor('minecraft:rose_bush[half=lower]')).toBe(false);expect(isFallbackColor('minecraft:ochre_froglight')).toBe(false)});
  it('recognises broad-palette utility blocks',()=>{for(const name of ['jukebox','smoker','ender_chest','trapped_chest','ladder'])expect(isFallbackColor(`minecraft:${name}`)).toBe(false)});
  it('recognises weathered lightning rods and cake',()=>{expect(isFallbackColor('minecraft:waxed_exposed_lightning_rod[facing=up]')).toBe(false);expect(isFallbackColor('minecraft:cake[bites=0]')).toBe(false)});
  it('does not mistake stairs for air',()=>{expect(colorFor('minecraft:oak_stairs[facing=east]')).not.toBe(0)});
  it('reads colours from generic block-state properties',()=>{expect(colorFor('minecraft:concrete[color=green]')).toBe(colorFor('minecraft:green_concrete'))});
});
