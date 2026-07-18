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
const legacyNames:Record<number,string>={0:'minecraft:air',1:'minecraft:stone',2:'minecraft:grass_block',3:'minecraft:dirt',4:'minecraft:cobblestone',5:'minecraft:oak_planks',7:'minecraft:bedrock',8:'minecraft:water',9:'minecraft:water',12:'minecraft:sand',13:'minecraft:gravel',17:'minecraft:oak_log',18:'minecraft:oak_leaves',20:'minecraft:glass',24:'minecraft:sandstone',35:'minecraft:white_wool',41:'minecraft:gold_block',42:'minecraft:iron_block',45:'minecraft:bricks',49:'minecraft:obsidian',79:'minecraft:ice',80:'minecraft:snow_block',87:'minecraft:netherrack',89:'minecraft:glowstone',98:'minecraft:stone_bricks'};

export function decodeVarints(bytes:Uint8Array, expected:number):Uint32Array{
  const out=new Uint32Array(expected);let index=0,value=0,shift=0;
  for(const byte of bytes){value|=(byte&0x7f)<<shift;if(byte&0x80){shift+=7;if(shift>28)throw new Error('Invalid schematic varint')}else{if(index>=expected)throw new Error('Schematic contains too many block states');out[index++]=value>>>0;value=0;shift=0}}
  if(shift!==0)throw new Error('Truncated schematic varint');if(index!==expected)throw new Error(`Schematic contains ${index} block states; expected ${expected}`);return out;
}

function readLegacy(n:NbtCompound):Schematic{
  const {width,height,length}=dimensions(n),raw=n.Blocks;if(!width||!height||!length||!(raw instanceof Uint8Array))throw new Error('Invalid classic MCEdit schematic');
  const count=width*height*length;if(raw.length!==count)throw new Error(`Block array has ${raw.length} entries; expected ${count}`);
  const ids=new Uint16Array(count);ids.set(raw);const add=n.AddBlocks;if(add instanceof Uint8Array)for(let i=0;i<count;i++)ids[i]|=(((i&1)?add[i>>1]>>4:add[i>>1]&15)<<8);
  const palette=['minecraft:air'],lookup=new Map<number,number>([[0,0]]),states=new Uint32Array(count);
  for(let i=0;i<count;i++){const id=ids[i];let state=lookup.get(id);if(state===undefined){state=palette.length;lookup.set(id,state);palette.push(legacyNames[id]??`legacy:block_${id}`)}states[i]=state}
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

export function readParsedSchematic(root:NbtCompound):Schematic{
  if(root.Blocks instanceof Uint8Array&&root.Width!==undefined)return readLegacy(root);
  const nested=compound(root.Schematic);if(nested?.Version!==undefined)return readSponge(nested);
  if(root.Version!==undefined&&(root.BlockData instanceof Uint8Array||compound(root.Blocks)))return readSponge(root);
  if(Array.isArray(root.size)&&Array.isArray(root.palette)&&Array.isArray(root.blocks))return readStructure(root);
  throw new Error('Unsupported NBT structure. Expected .schematic, Sponge .schem, or Java structure .nbt');
}

export function readSchematic(data:Uint8Array):Schematic{return readParsedSchematic(parseNbt(data))}
