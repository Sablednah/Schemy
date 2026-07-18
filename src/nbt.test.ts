import { describe, expect, it } from 'vitest';
import { decodeVarints, readParsedSchematic, type NbtCompound } from './nbt';

describe('schematic formats', () => {
  it('decodes Sponge varints', () => {
    expect([...decodeVarints(new Uint8Array([0, 1, 0xac, 0x02]), 3)]).toEqual([0, 1, 300]);
  });

  it('reads Sponge v2', () => {
    const root:NbtCompound={Version:2,Width:2,Height:1,Length:1,Palette:{'minecraft:air':0,'minecraft:stone':1},BlockData:new Uint8Array([0,1])};
    const result=readParsedSchematic(root);
    expect(result.format).toBe('Sponge v2');
    expect([...result.states]).toEqual([0,1]);
  });

  it('reads nested Sponge v3', () => {
    const root:NbtCompound={Schematic:{Version:3,Width:1,Height:1,Length:2,Blocks:{Palette:{'minecraft:oak_planks':0,'minecraft:glass':1},Data:new Uint8Array([0,1])}}};
    const result=readParsedSchematic(root);
    expect(result.format).toBe('Sponge v3');
    expect(result.palette).toEqual(['minecraft:oak_planks','minecraft:glass']);
  });

  it('reads sparse Java structure NBT', () => {
    const root:NbtCompound={size:[2,1,1],palette:[{Name:'minecraft:stone'},{Name:'minecraft:oak_log',Properties:{axis:'y'}}],blocks:[{pos:[1,0,0],state:1}]};
    const result=readParsedSchematic(root);
    expect(result.format).toBe('Java structure NBT');
    expect(result.palette).toEqual(['minecraft:air','minecraft:stone','minecraft:oak_log[axis=y]']);
    expect([...result.states]).toEqual([0,2]);
  });
});
