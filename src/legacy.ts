const colors=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'];
const woods=['oak','spruce','birch','jungle','acacia','dark_oak'];
const stoneSlabs=['stone','sandstone','petrified_oak','cobblestone','brick','stone_brick','nether_brick','quartz'];

const names:Record<number,string>={
  0:'air',1:'stone',2:'grass_block',3:'dirt',4:'cobblestone',5:'oak_planks',6:'oak_sapling',7:'bedrock',8:'water',9:'water',10:'lava',11:'lava',12:'sand',13:'gravel',14:'gold_ore',15:'iron_ore',16:'coal_ore',17:'oak_log',18:'oak_leaves',19:'sponge',20:'glass',21:'lapis_ore',22:'lapis_block',23:'dispenser',24:'sandstone',25:'note_block',26:'red_bed',27:'powered_rail',28:'detector_rail',29:'sticky_piston',30:'cobweb',31:'grass',32:'dead_bush',33:'piston',34:'piston_head',35:'white_wool',36:'moving_piston',37:'dandelion',38:'poppy',39:'brown_mushroom',40:'red_mushroom',41:'gold_block',42:'iron_block',43:'stone_slab',44:'stone_slab',45:'bricks',46:'tnt',47:'bookshelf',48:'mossy_cobblestone',49:'obsidian',50:'torch',51:'fire',52:'spawner',53:'oak_stairs',54:'chest',55:'redstone_wire',56:'diamond_ore',57:'diamond_block',58:'crafting_table',59:'wheat',60:'farmland',61:'furnace',62:'furnace',63:'oak_sign',64:'oak_door',65:'ladder',66:'rail',67:'cobblestone_stairs',68:'oak_wall_sign',69:'lever',70:'stone_pressure_plate',71:'iron_door',72:'oak_pressure_plate',73:'redstone_ore',74:'redstone_ore',75:'redstone_torch',76:'redstone_torch',77:'stone_button',78:'snow',79:'ice',80:'snow_block',81:'cactus',82:'clay',83:'sugar_cane',84:'jukebox',85:'oak_fence',86:'carved_pumpkin',87:'netherrack',88:'soul_sand',89:'glowstone',90:'nether_portal',91:'jack_o_lantern',92:'cake',93:'repeater',94:'repeater',95:'white_stained_glass',96:'oak_trapdoor',97:'infested_stone',98:'stone_bricks',99:'brown_mushroom_block',100:'red_mushroom_block',101:'iron_bars',102:'glass_pane',103:'melon',104:'pumpkin_stem',105:'melon_stem',106:'vine',107:'oak_fence_gate',108:'brick_stairs',109:'stone_brick_stairs',110:'mycelium',111:'lily_pad',112:'nether_bricks',113:'nether_brick_fence',114:'nether_brick_stairs',115:'nether_wart',116:'enchanting_table',117:'brewing_stand',118:'cauldron',119:'end_portal',120:'end_portal_frame',121:'end_stone',122:'dragon_egg',123:'redstone_lamp',124:'redstone_lamp',125:'oak_slab',126:'oak_slab',127:'cocoa',128:'sandstone_stairs',129:'emerald_ore',130:'ender_chest',131:'tripwire_hook',132:'tripwire',133:'emerald_block',134:'spruce_stairs',135:'birch_stairs',136:'jungle_stairs',137:'command_block',138:'beacon',139:'cobblestone_wall',140:'flower_pot',141:'carrots',142:'potatoes',143:'oak_button',144:'skeleton_skull',145:'anvil',146:'trapped_chest',147:'light_weighted_pressure_plate',148:'heavy_weighted_pressure_plate',149:'comparator',150:'comparator',151:'daylight_detector',152:'redstone_block',153:'nether_quartz_ore',154:'hopper',155:'quartz_block',156:'quartz_stairs',157:'activator_rail',158:'dropper',159:'white_terracotta',160:'white_stained_glass_pane',161:'acacia_leaves',162:'acacia_log',163:'acacia_stairs',164:'dark_oak_stairs',165:'slime_block',166:'barrier',167:'iron_trapdoor',168:'prismarine',169:'sea_lantern',170:'hay_block',171:'white_carpet',172:'terracotta',173:'coal_block',174:'packed_ice',175:'sunflower',176:'white_banner',177:'white_wall_banner',178:'daylight_detector',179:'red_sandstone',180:'red_sandstone_stairs',181:'red_sandstone_slab',182:'red_sandstone_slab',183:'spruce_fence_gate',184:'birch_fence_gate',185:'jungle_fence_gate',186:'dark_oak_fence_gate',187:'acacia_fence_gate',188:'spruce_fence',189:'birch_fence',190:'jungle_fence',191:'dark_oak_fence',192:'acacia_fence',193:'spruce_door',194:'birch_door',195:'jungle_door',196:'acacia_door',197:'dark_oak_door',198:'end_rod',199:'chorus_plant',200:'chorus_flower',201:'purpur_block',202:'purpur_pillar',203:'purpur_stairs',204:'purpur_slab',205:'purpur_slab',206:'end_stone_bricks',207:'beetroots',208:'dirt_path',209:'end_gateway',210:'repeating_command_block',211:'chain_command_block',212:'frosted_ice',213:'magma_block',214:'nether_wart_block',215:'red_nether_bricks',216:'bone_block',217:'structure_void',218:'observer'};
for(let i=0;i<16;i++)names[219+i]=`${colors[i]}_shulker_box`;
for(let i=0;i<16;i++)names[235+i]=`${colors[i]}_glazed_terracotta`;
names[251]='white_concrete';names[252]='white_concrete_powder';names[255]='structure_block';

const props=(name:string,p:Record<string,string|number|boolean>)=>`minecraft:${name}[${Object.entries(p).map(([k,v])=>`${k}=${v}`).join(',')}]`;
const plain=(name:string)=>`minecraft:${name}`;
const facing4=(value:number)=>['east','west','south','north'][value&3];
const horizontal=(value:number)=>({2:'north',3:'south',4:'west',5:'east'}[value&7]??'north');

export function legacyBlockState(id:number,data=0):string{
  data&=15;
  if(id===1)return plain(['stone','granite','polished_granite','diorite','polished_diorite','andesite','polished_andesite'][data]??'stone');
  if(id===3)return plain(['dirt','coarse_dirt','podzol'][data]??'dirt');
  if(id===5)return plain(`${woods[data&7]??'oak'}_planks`);
  if(id===6)return props(`${woods[data&7]??'oak'}_sapling`,{stage:(data>>3)&1});
  if(id===12)return plain(data===1?'red_sand':'sand');
  if(id===17||id===162){const species=id===162?['acacia','dark_oak'][data&1]:woods[data&3],axis=['y','x','z','none'][(data>>2)&3];return props(`${species}_log`,{axis})}
  if(id===18||id===161){const species=id===161?['acacia','dark_oak'][data&1]:woods[data&3];return props(`${species}_leaves`,{persistent:Boolean(data&4)})}
  if(id===19)return plain(data?'wet_sponge':'sponge');
  if(id===24)return plain(['sandstone','chiseled_sandstone','cut_sandstone'][data]??'sandstone');
  if(id===31)return plain(data===2?'fern':data===1?'grass':'dead_bush');
  if(id===35)return plain(`${colors[data]}_wool`);
  if(id===38)return plain(['poppy','blue_orchid','allium','azure_bluet','red_tulip','orange_tulip','white_tulip','pink_tulip','oxeye_daisy'][data]??'poppy');
  if(id===43||id===44){const material=stoneSlabs[data&7]??'stone';return props(`${material}_slab`,{type:id===43?'double':data&8?'top':'bottom'})}
  if(id===50||id===75||id===76){const name=id===50?'torch':'redstone_torch';return data===5?plain(name):props(`wall_${name}`,{facing:horizontal(data)})}
  const stairIds=new Set([53,67,108,109,114,128,134,135,136,156,163,164,180,203]);if(stairIds.has(id))return props(names[id],{facing:facing4(data),half:data&4?'top':'bottom',shape:'straight'});
  if(id===59)return props('wheat',{age:data&7});if(id===60)return props('farmland',{moisture:data&7});
  if(id===63||id===176)return props(names[id],{rotation:data});if(id===65||id===68||id===177)return props(names[id],{facing:horizontal(data)});
  if(id===64||id===71||id>=193&&id<=197){if(data&8)return props(names[id],{half:'upper',hinge:data&1?'right':'left'});return props(names[id],{half:'lower',facing:['east','south','west','north'][data&3],open:Boolean(data&4)})}
  if(id===78)return props('snow',{layers:Math.min(8,(data&7)+1)});
  if(id===86||id===91)return props(names[id],{facing:['south','west','north','east'][data&3]});
  if(id===95)return plain(`${colors[data]}_stained_glass`);
  if(id===96||id===167)return props(names[id],{facing:['south','north','east','west'][data&3],open:Boolean(data&4),half:data&8?'top':'bottom'});
  if(id===97)return plain(['infested_stone','infested_cobblestone','infested_stone_bricks','infested_mossy_stone_bricks','infested_cracked_stone_bricks','infested_chiseled_stone_bricks'][data]??'infested_stone');
  if(id===98)return plain(['stone_bricks','mossy_stone_bricks','cracked_stone_bricks','chiseled_stone_bricks'][data]??'stone_bricks');
  if(id===106)return props('vine',{south:Boolean(data&1),west:Boolean(data&2),north:Boolean(data&4),east:Boolean(data&8)});
  if(id===107||id>=183&&id<=187)return props(names[id],{facing:['south','west','north','east'][data&3],open:Boolean(data&4)});
  if(id===125||id===126){const wood=woods[data&7]??'oak';return props(`${wood}_slab`,{type:id===125?'double':data&8?'top':'bottom'})}
  if(id===139)return plain(data?'mossy_cobblestone_wall':'cobblestone_wall');
  if(id===145)return props('anvil',{facing:data&1?'west':'north',damage:(data>>2)&3});
  if(id===159)return plain(`${colors[data]}_terracotta`);if(id===160)return plain(`${colors[data]}_stained_glass_pane`);if(id===168)return plain(['prismarine','prismarine_bricks','dark_prismarine'][data]??'prismarine');
  if(id===171)return plain(`${colors[data]}_carpet`);if(id===175)return plain(['sunflower','lilac','tall_grass','large_fern','rose_bush','peony'][data&7]??'sunflower');
  if(id===179)return plain(['red_sandstone','chiseled_red_sandstone','cut_red_sandstone'][data]??'red_sandstone');
  if(id===181||id===182)return props('red_sandstone_slab',{type:id===181?'double':data&8?'top':'bottom'});
  if(id===198)return props('end_rod',{facing:['down','up','north','south','west','east'][data&7]??'up'});
  if(id===251)return plain(`${colors[data]}_concrete`);if(id===252)return plain(`${colors[data]}_concrete_powder`);
  const name=names[id];return name?plain(name):`legacy:block_${id}[data=${data}]`;
}
