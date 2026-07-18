export type Nbt = number | bigint | string | Uint8Array | Int32Array | BigInt64Array | Nbt[] | { [key: string]: Nbt };
export function parseNbt(input: Uint8Array): { [key: string]: Nbt } {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength); let p = 0;
  const u8=()=>view.getUint8(p++), i8=()=>view.getInt8(p++), i16=()=>{const v=view.getInt16(p);p+=2;return v}, i32=()=>{const v=view.getInt32(p);p+=4;return v}, i64=()=>{const v=view.getBigInt64(p);p+=8;return v}, f32=()=>{const v=view.getFloat32(p);p+=4;return v}, f64=()=>{const v=view.getFloat64(p);p+=8;return v};
  const str=()=>{const n=view.getUint16(p);p+=2;const v=new TextDecoder().decode(input.subarray(p,p+n));p+=n;return v};
  const payload=(type:number):Nbt=>{ switch(type){case 1:return i8();case 2:return i16();case 3:return i32();case 4:return i64();case 5:return f32();case 6:return f64();case 7:{const n=i32();const v=input.slice(p,p+n);p+=n;return v}case 8:return str();case 9:{const t=u8(),n=i32(),a:Nbt[]=[];for(let i=0;i<n;i++)a.push(payload(t));return a}case 10:{const o:{[k:string]:Nbt}={};for(;;){const t=u8();if(!t)break;o[str()]=payload(t)}return o}case 11:{const n=i32(),a=new Int32Array(n);for(let i=0;i<n;i++)a[i]=i32();return a}case 12:{const n=i32(),a=new BigInt64Array(n);for(let i=0;i<n;i++)a[i]=i64();return a}default:throw new Error(`Unsupported NBT tag ${type}`)} };
  const type=u8(); if(type!==10)throw new Error('Schematic root must be an NBT compound'); str(); return payload(type) as {[k:string]:Nbt};
}

export type Schematic = { width:number; height:number; length:number; blocks:Uint16Array };
export function readClassicSchematic(data: Uint8Array): Schematic {
  const n=parseNbt(data), width=Number(n.Width),height=Number(n.Height),length=Number(n.Length), raw=n.Blocks;
  if(!width||!height||!length||!(raw instanceof Uint8Array)) throw new Error('Not a classic MCEdit .schematic file');
  const count=width*height*length;if(raw.length!==count)throw new Error(`Block array has ${raw.length} entries; expected ${count}`);
  const blocks=new Uint16Array(count); blocks.set(raw);
  const add=n.AddBlocks;if(add instanceof Uint8Array) for(let i=0;i<count;i++){const nibble=(i&1)?add[i>>1]>>4:add[i>>1]&15;blocks[i]|=nibble<<8}
  return {width,height,length,blocks};
}
