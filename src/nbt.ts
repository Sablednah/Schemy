import { legacyBlockState } from './legacy.js';
export type Nbt = number | bigint | string | Uint8Array | Int32Array | BigInt64Array | Nbt[] | NbtCompound;
export type NbtCompound = { [key: string]: Nbt };

export function parseNbt(input: Uint8Array): NbtCompound {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength); let p = 0;
  const need=(n:number)=>{if(p+n>view.byteLength)throw new Error('Unexpected end of NBT data')};
  const u8=()=>{need(1);return view.getUint8(p++)}, i8=()=>{need(1);return view.getInt8(p++)}, i16=()=>{need(2);const v=view.getInt16(p);p+=2;return v}, i32=()=>{need(4);const v=view.getInt32(p);p+=4;return v}, i64=()=>{need(8);const v=view.getBigInt64(p);p+=8;return v}, f32=()=>{need(4);const v=view.getFloat32(p);p+=4;return v}, f64=()=>{need(8);const v=view.getFloat64(p);p+=8;return v};
  const str=()=>{need(2);const n=view.getUint16(p);p+=2;need(n);const v=new TextDecoder().decode(input.subarray(p,p+n));p+=n;return v};
  const payload=(type:number):Nbt=>{switch(type){case 1:return i8();case 2:return i16();case 3:return i32();case 4:return i64();case 5:return f32();case 6:return f64();case 7:{const n=i32();if(n<0)throw new Error('Negative NBT array length');need(n);const v=input.slice(p,p+n);p+=n;return v}case 8:return str();case 9:{const t=u8(),n=i32(),a:Nbt[]=[];if(n<0)throw new Error('Negative NBT list length');for(let i=0;i<n;i++)a.push(payload(t));return a}case 10:{const o:NbtCompound={};for(;;){const t=u8();if(!t)break;o[str()]=payload(t)}return o}case 11:{const n=i32(),a=new Int32Array(n);for(let i=0;i<n;i++)a[i]=i32();return a}case 12:{const n=i32(),a=new BigInt64Array(n);for(let i=0;i<n;i++)a[i]=i64();return a}default:throw new Error(`Unsupported NBT tag ${type}`)}};
  const type=u8();if(type!==10)throw new Error('NBT root must be a compound');str();return payload(type) as NbtCompound;
}

export type Schematic = {
  width:number; height:number; length:number;
  states:Uint32Array; palette:string[]; format:string;
};

const compound=(value:Nbt|undefined):NbtCompound|undefined=>value && typeof value==='object' && !Array.isArray(value) && !(value instanceof Uint8Array) && !(value instanceof Int32Array) && !(value instanceof BigInt64Array) ? value as NbtCompound : undefined;
const list=(value:Nbt|undefined):Nbt[]|undefined=>Array.isArray(value)?value:undefined;
const dimensions=(n:NbtCompound)=>({width:Number(n.Width)&0xffff,height:Number(n.Height)&0xffff,length:Number(n.Length)&0xffff});
export function decodeVarints(bytes:Uint8Array, expected:number):Uint32Array{
  const out=new Uint32Array(expected);let index=0,value=0,shift=0;
  for(const byte of bytes){value|=(byte&0x7f)<<shift;if(byte&0x80){shift+=7;if(shift>28)throw new Error('Invalid schematic varint')}else{if(index>=expected)throw new Error('Schematic contains too many block states');out[index++]=value>>>0;value=0;shift=0}}
  if(shift!==0)throw new Error('Truncated schematic varint');if(index!==expected)throw new Error(`Schematic contains ${index} block states; expected ${expected}`);return out;
}

function readLegacy(n:NbtCompound):Schematic{
  const {width,height,length}=dimensions(n),raw=n.Blocks;if(!width||!height||!length||!(raw instanceof Uint8Array))throw new Error('Invalid classic MCEdit schematic');
  const count=width*height*length;if(raw.length!==count)throw new Error(`Block array has ${raw.length} entries; expected ${count}`);
  const ids=new Uint16Array(count);ids.set(raw);const add=n.AddBlocks;if(add instanceof Uint8Array)for(let i=0;i<count;i++)ids[i]|=(((i&1)?add[i>>1]>>4:add[i>>1]&15)<<8);
  const metadata=n.Data instanceof Uint8Array?n.Data:undefined;if(metadata&&metadata.length!==count)throw new Error(`Data array has ${metadata.length} entries; expected ${count}`);
  const palette=['minecraft:air'],lookup=new Map<number,number>([[0,0]]),states=new Uint32Array(count);
  for(let i=0;i<count;i++){const id=ids[i],data=(metadata?.[i]??0)&15,key=id<<4|data;let state=lookup.get(key);if(state===undefined){state=palette.length;lookup.set(key,state);palette.push(legacyBlockState(id,data))}states[i]=state}
  return {width,height,length,states,palette,format:'Classic MCEdit'};
}

function paletteArray(value:Nbt|undefined):string[]{const p=compound(value);if(!p)throw new Error('Sponge schematic has no block palette');const result:string[]=[];for(const [name,id] of Object.entries(p))result[Number(id)]=name;return result.map((v,i)=>v??`unknown:palette_${i}`)}

function readSponge(n:NbtCompound):Schematic{
  const version=Number(n.Version),{width,height,length}=dimensions(n),count=width*height*length;if(!width||!height||!length)throw new Error('Sponge schematic has invalid dimensions');
  let palette:string[],data:Nbt|undefined;if(version>=3){const blocks=compound(n.Blocks);if(!blocks)throw new Error('Sponge v3 schematic has no Blocks container');palette=paletteArray(blocks.Palette);data=blocks.Data}else{palette=paletteArray(n.Palette);data=n.BlockData}
  if(!(data instanceof Uint8Array))throw new Error('Sponge schematic has no block data');return {width,height,length,states:decodeVarints(data,count),palette,format:`Sponge v${version}`};
}

function blockStateName(entry:Nbt):string{const e=compound(entry);if(!e||typeof e.Name!=='string')return 'minecraft:air';const props=compound(e.Properties);if(!props)return e.Name;const values=Object.entries(props).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${String(v)}`);return values.length?`${e.Name}[${values.join(',')}]`:e.Name}

function readStructure(n:NbtCompound):Schematic{
  const size=list(n.size);if(!size||size.length!==3)throw new Error('Java structure has no valid size');const [width,height,length]=size.map(Number);if(!width||!height||!length)throw new Error('Java structure has invalid dimensions');
  const entries=list(n.palette);if(!entries)throw new Error('Java structure has no palette');let palette=entries.map(blockStateName),air=palette.findIndex(x=>x==='minecraft:air'),shift=0;if(air<0){palette=['minecraft:air',...palette];air=0;shift=1}
  const states=new Uint32Array(width*height*length);states.fill(air);for(const value of list(n.blocks)??[]){const b=compound(value),pos=list(b?.pos);if(!b||!pos||pos.length!==3)continue;const [x,y,z]=pos.map(Number);if(x<0||y<0||z<0||x>=width||y>=height||z>=length)continue;states[x+z*width+y*width*length]=Number(b.state)+shift}
  return {width,height,length,states,palette,format:'Java structure NBT'};
}

function xyz(value:Nbt|undefined,label:string){const v=compound(value);if(!v)throw new Error(`Litematic region has no ${label}`);return {x:Number(v.x),y:Number(v.y),z:Number(v.z)}}

export function decodePackedStates(data:BigInt64Array,count:number,paletteSize:number):Uint32Array{
  const bits=Math.max(2,Math.ceil(Math.log2(Math.max(1,paletteSize)))),mask=(1n<<BigInt(bits))-1n,out=new Uint32Array(count),unsigned=[...data].map(v=>BigInt.asUintN(64,v));
  if(data.length<Math.ceil(count*bits/64))throw new Error('Litematic block-state array is truncated');
  for(let i=0;i<count;i++){const bit=i*bits,index=Math.floor(bit/64),offset=bit%64;let value=unsigned[index]>>BigInt(offset);if(offset+bits>64)value|=unsigned[index+1]<<BigInt(64-offset);out[i]=Number(value&mask)}return out;
}

function readLitematic(n:NbtCompound):Schematic{
  const regions=compound(n.Regions);if(!regions)throw new Error('Litematic has no regions');
  const parsed:{position:{x:number;y:number;z:number};size:{x:number;y:number;z:number};width:number;height:number;length:number;palette:string[];states:Uint32Array}[]=[];
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const value of Object.values(regions)){const region=compound(value);if(!region)continue;const position=xyz(region.Position,'Position'),size=xyz(region.Size,'Size'),width=Math.abs(size.x),height=Math.abs(size.y),length=Math.abs(size.z),entries=list(region.BlockStatePalette),packed=region.BlockStates;if(!width||!height||!length||!entries||!(packed instanceof BigInt64Array))continue;const palette=entries.map(blockStateName),states=decodePackedStates(packed,width*height*length,palette.length);parsed.push({position,size,width,height,length,palette,states});minX=Math.min(minX,position.x+(size.x<0?size.x+1:0));minY=Math.min(minY,position.y+(size.y<0?size.y+1:0));minZ=Math.min(minZ,position.z+(size.z<0?size.z+1:0));maxX=Math.max(maxX,position.x+(size.x>0?size.x-1:0));maxY=Math.max(maxY,position.y+(size.y>0?size.y-1:0));maxZ=Math.max(maxZ,position.z+(size.z>0?size.z-1:0))}
  if(!parsed.length)throw new Error('Litematic contains no readable regions');const width=maxX-minX+1,height=maxY-minY+1,length=maxZ-minZ+1,states=new Uint32Array(width*height*length),palette=['minecraft:air'],lookup=new Map<string,number>([['minecraft:air',0]]);
  for(const region of parsed){const remap=region.palette.map(name=>{if(name==='minecraft:cave_air'||name==='minecraft:void_air')return 0;let id=lookup.get(name);if(id===undefined){id=palette.length;lookup.set(name,id);palette.push(name)}return id});for(let y=0;y<region.height;y++)for(let z=0;z<region.length;z++)for(let x=0;x<region.width;x++){const local=x+z*region.width+y*region.width*region.length,id=remap[region.states[local]]??0;if(!id)continue;const worldX=region.position.x+(region.size.x<0?-x:x)-minX,worldY=region.position.y+(region.size.y<0?-y:y)-minY,worldZ=region.position.z+(region.size.z<0?-z:z)-minZ;states[worldX+worldZ*width+worldY*width*length]=id}}
  return {width,height,length,states,palette,format:`Litematic v${Number(n.Version)||'?'}`};
}

export function readParsedSchematic(root:NbtCompound):Schematic{
  if(root.Blocks instanceof Uint8Array&&root.Width!==undefined)return readLegacy(root);
  if(compound(root.Regions)&&root.Version!==undefined)return readLitematic(root);
  const nested=compound(root.Schematic);if(nested?.Version!==undefined)return readSponge(nested);
  if(root.Version!==undefined&&(root.BlockData instanceof Uint8Array||compound(root.Blocks)))return readSponge(root);
  if(Array.isArray(root.size)&&Array.isArray(root.palette)&&Array.isArray(root.blocks))return readStructure(root);
  throw new Error('Unsupported NBT structure. Expected .schematic, .schem, .nbt, or .litematic');
}

export function readSchematic(data:Uint8Array):Schematic{return readParsedSchematic(parseNbt(data))}
