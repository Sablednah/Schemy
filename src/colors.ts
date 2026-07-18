import { blockName } from './geometry.js';

const FALLBACK_COLOR=0xbd63b8;
const legacyColors:Record<number,number>={1:0x8c8c8c,2:0x60913b,3:0x79563a,4:0x777777,5:0xb88a55,7:0x333333,8:0x377dba,9:0x377dba,12:0xdac68b,13:0x8a806e,17:0x715236,18:0x3d713a,20:0xb9d7df,24:0xd4bd78,35:0xd8d8d8,41:0xf4cf42,42:0xbfc3c4,45:0x9d4d36,49:0x312244,79:0xa9d7e8,80:0xf5f5f5,87:0x74352d,89:0xd6b84c,98:0x777777};
const dyes:Record<string,number>={white:0xe9ecec,orange:0xf07613,magenta:0xbd44b3,light_blue:0x3aafd9,yellow:0xf8c627,lime:0x70b919,pink:0xed8dac,gray:0x3e4447,light_gray:0x8e9597,cyan:0x158991,purple:0x792aac,blue:0x35399d,brown:0x724728,green:0x546d1b,red:0xa12722,black:0x141519};
const woodColors:Record<string,number>={oak:0xb88a55,spruce:0x765436,birch:0xd7c185,jungle:0xb8784a,acacia:0xb75e3c,dark_oak:0x4d321f,mangrove:0x773c3b,cherry:0xd99b98,bamboo:0xc4ad54,crimson:0x7f3b58,warped:0x3d8e86};

export function colorFor(state:string){
  const legacy=/legacy:block_(\d+)/.exec(state);if(legacy)return legacyColors[Number(legacy[1])]??FALLBACK_COLOR;
  const n=blockName(state);if(['air','cave_air','void_air','structure_void','barrier','light'].includes(n))return 0;
  if(n.includes('grass')||n.includes('moss')||n.includes('azalea'))return 0x60913b;if(n.includes('leaves')||n.includes('vine'))return 0x3d713a;
  if(/flower|tulip|orchid|dandelion|poppy|lilac|peony|rose_bush|bluet|daisy|allium|sunflower|spore_blossom|lily|pitcher|wither_rose/.test(n))return 0x769b43;
  if(/sugar_cane|bamboo|cactus|fern|bush|sapling|wheat|carrots|potatoes|beetroots|kelp|seagrass|roots|dripleaf|lily_pad|sea_pickle/.test(n))return 0x6e913c;
  if(n.includes('water')||n.includes('ice'))return 0x377dba;if(n.includes('lava')||n.includes('magma'))return 0xe86f24;
  if(n.includes('sand'))return 0xdac68b;if(n.includes('dirt')||n.includes('mud')||n==='farmland'||n==='podzol')return 0x79563a;
  if(n==='mycelium')return 0x6f5a62;if(n.includes('nylium'))return n.includes('warped')?0x167d73:0x8b3049;
  if(n.includes('granite'))return 0x9b6755;if(n.includes('diorite')||n.includes('calcite'))return 0xc9c7bf;if(n.includes('andesite')||n.includes('tuff'))return 0x777b78;
  if(n.includes('basalt')||n.includes('blackstone'))return 0x37343b;if(n.includes('prismarine'))return 0x5e9b8b;if(n.includes('end_stone'))return 0xd8d69b;
  if(n.includes('amethyst'))return 0x9365b8;if(n.includes('purpur'))return 0xa878aa;
  if(n.includes('sculk'))return 0x123e43;if(n.includes('coral'))return n.startsWith('dead_')?0x6f6967:0x4f91a6;
  for(const [wood,color] of Object.entries(woodColors).sort(([a],[b])=>b.length-a.length))if(n===wood||n.startsWith(`${wood}_`)||n.includes(`_${wood}_`))return color;
  if(n.includes('log')||n.includes('wood')||n.includes('stem')||n.includes('hyphae'))return 0x715236;if(n.includes('planks'))return 0xb88a55;
  if(n.includes('bookshelf')||n.includes('chest')||n==='barrel'||n==='crafting_table'||n==='loom'||n==='lectern'||n==='composter'||n==='beehive'||n==='jukebox'||n==='ladder')return 0x9a6a3f;
  if(n.includes('glass'))return 0xb9d7df;if(n.includes('snow')||n.includes('quartz'))return 0xeeeeee;
  if(n.includes('gold'))return 0xf4cf42;if(n.includes('iron')||n==='anvil'||n==='hopper'||n==='chain')return 0xbfc3c4;if(n.includes('copper')||n.endsWith('lightning_rod'))return 0xb66e4a;
  if(n.includes('diamond'))return 0x55d6cf;if(n.includes('emerald'))return 0x36b95f;if(n.includes('lapis'))return 0x3155a5;if(n.includes('coal'))return 0x424242;if(n.includes('netherite')||n==='ancient_debris')return 0x4b4142;
  if(n.includes('brick'))return 0x9d4d36;if(n.includes('obsidian'))return 0x312244;if(n.includes('netherrack'))return 0x74352d;
  if(n.includes('redstone'))return 0xa12722;
  const propertyColor=/[\[,]color=([a-z_]+)/.exec(state)?.[1];if(propertyColor&&dyes[propertyColor])return dyes[propertyColor];
  const dye=Object.keys(dyes).sort((a,b)=>b.length-a.length).find(color=>n===color||n.startsWith(`${color}_`)||n.includes(`_${color}_`));
  if(dye)return dyes[dye];
  if(/furnace|smoker|dispenser|dropper|observer|piston|repeater|comparator|daylight_detector|rail|spawner/.test(n))return 0x777777;
  if(n.includes('torch'))return n.includes('soul_')?0x397b7d:0x9b693b;if(n==='fire')return 0xe86f24;
  if(n.includes('portal'))return 0x6f3ba8;if(n.includes('banner'))return 0xddd5c5;
  if(['trapdoor','fence','bed'].includes(n))return 0xb88a55;
  if(/pumpkin|melon|jack_o_lantern/.test(n))return 0xd17b28;if(n.includes('honey'))return 0xd89b24;if(n.includes('slime'))return 0x75ba54;if(n.includes('cake'))return 0xe5d2bd;
  if(/skull|_head$/.test(n))return 0x756b5c;if(n.includes('nether_wart'))return 0x8b2733;
  const utility:Record<string,number>={shroomlight:0xf3a456,glowstone:0xd6b84c,ochre_froglight:0xe9d9a0,verdant_froglight:0xc7dfb0,pearlescent_froglight:0xdbaed2,sea_lantern:0xb7d9d1,beacon:0x75d9dc,conduit:0x5ab9ae,coal_ore:0x555555,firefly_bush:0x668f45,campfire:0x70462d,smithing_table:0x5e4b40,note_block:0x765036,decorated_pot:0x9c593e,terracotta:0x985f45,clay:0x9da4aa,bone_block:0xd8d2b4,cobweb:0xd8d8d8,dragon_egg:0x251b32,enchanting_table:0x5b3349,hay_block:0xc6a832,sponge:0xc7bd45,target:0xd9c7b1,tnt:0xb83a2f,respawn_anchor:0x42304f,shulker_box:0x895693,turtle_egg:0xd8d5aa,scaffolding:0xc1a557,bee_nest:0xb88a55,cartography_table:0x805d42,fletching_table:0xb49b70,brewing_stand:0x777777,bell:0xd8aa32,candle:0xe2d0a4,cauldron:0x55585b,lantern:0xc28b32,soul_lantern:0x39999c,torch:0x9b693b,soul_torch:0x397b7d,lever:0x777777,tripwire_hook:0x8d806e,heavy_weighted_pressure_plate:0xbfc3c4,light_weighted_pressure_plate:0xf4cf42,end_rod:0xe5ddec,lightning_rod:0xb66e4a};
  if(utility[n])return utility[n];
  if(n.includes('stone')||n.includes('cobble')||n.includes('gravel')||n.includes('deepslate')||n==='bedrock')return 0x777777;
  return n.includes('terracotta')?0x985f45:FALLBACK_COLOR;
}

export function isFallbackColor(state:string){return colorFor(state)===FALLBACK_COLOR}
