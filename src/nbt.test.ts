import { describe, expect, it } from 'vitest';
import { decodePackedStates, decodeVarints, readParsedSchematic, type NbtCompound } from './nbt';

function pack(values:number[],paletteSize:number){const bits=Math.max(2,Math.ceil(Math.log2(paletteSize))),data=Array<bigint>(Math.ceil(values.length*bits/64)).fill(0n);values.forEach((value,i)=>{const bit=i*bits,index=Math.floor(bit/64),offset=bit%64;data[index]|=BigInt(value)<<BigInt(offset);if(offset+bits>64)data[index+1]|=BigInt(value)>>BigInt(64-offset)});return new BigInt64Array(data.map(v=>BigInt.asIntN(64,v)))}

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

  it('decodes packed Litematic states across long boundaries',()=>{
    const values=Array.from({length:40},(_,i)=>i%5),packed=pack(values,5);
    expect([...decodePackedStates(packed,values.length,5)]).toEqual(values);
  });

  it('combines positioned Litematic regions including negative sizes',()=>{
    const region=(position:number,size:number,name:string)=>({Position:{x:position,y:0,z:0},Size:{x:size,y:1,z:1},BlockStatePalette:[{Name:'minecraft:air'},{Name:name}],BlockStates:pack([1,1],2)});
    const root:NbtCompound={Version:6,MinecraftDataVersion:3955,Metadata:{Name:'Multi-region'},Regions:{Left:region(0,2,'minecraft:stone'),Right:region(4,-2,'minecraft:gold_block')}};
    const result=readParsedSchematic(root);
    expect(result.format).toBe('Litematic v6');
    expect([result.width,result.height,result.length]).toEqual([5,1,1]);
    expect([...result.states]).toEqual([1,1,0,2,2]);
  });
});
