import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function blockName(state:string){return state.split('[',1)[0].replace(/^minecraft:/,'')}
export function blockProperties(state:string){const match=/\[(.*)]$/.exec(state),result:Record<string,string>={};if(match)for(const part of match[1].split(',')){const i=part.indexOf('=');if(i>0)result[part.slice(0,i)]=part.slice(i+1)}return result}
const box=(w:number,h:number,d:number,x=0,y=0,z=0)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
const merged=(...parts:THREE.BufferGeometry[])=>mergeGeometries(parts,false)??parts[0];
const facingAngle=(facing='north')=>({north:0,east:-Math.PI/2,south:Math.PI,west:Math.PI/2}[facing]??0);
const oriented=(geometry:THREE.BufferGeometry,facing?:string)=>geometry.rotateY(facingAngle(facing));
const connected=(value:string|undefined)=>value===undefined||!['false','none'].includes(value);

function stairGeometry(properties:Record<string,string>){const top=properties.half==='top',baseY=top ? .25 : -.25,stepY=top ? -.25 : .25,shape=properties.shape??'straight';let step:THREE.BufferGeometry;if(shape.startsWith('outer_')){const x=shape.endsWith('left') ? -.25 : .25;step=box(.5,.5,.5,x,stepY,-.25)}else if(shape.startsWith('inner_')){const x=shape.endsWith('left') ? -.25 : .25;step=merged(box(1,.5,.5,0,stepY,-.25),box(.5,.5,.5,x,stepY,.25))}else step=box(1,.5,.5,0,stepY,-.25);return oriented(merged(box(1,.5,1,0,baseY,0),step),properties.facing)}

function fenceGeometry(p:Record<string,string>){const parts=[box(.25,1.5,.25,0,.25,0)];if(connected(p.north))parts.push(box(.25,.375,.5,0,.125,-.25));if(connected(p.south))parts.push(box(.25,.375,.5,0,.125,.25));if(connected(p.east))parts.push(box(.5,.375,.25,.25,.125,0));if(connected(p.west))parts.push(box(.5,.375,.25,-.25,.125,0));return merged(...parts)}
function gateGeometry(p:Record<string,string>){const parts=[box(.1875,1.5,.1875,-.40625,.25,0),box(.1875,1.5,.1875,.40625,.25,0)];if(p.open!=='true'){parts.push(box(.625,.1875,.125,0,.25,0),box(.625,.1875,.125,0,-.25,0))}return oriented(merged(...parts),p.facing)}
function paneGeometry(p:Record<string,string>){const parts=[box(.125,1,.125)];if(connected(p.north))parts.push(box(.125,1,.5,0,0,-.25));if(connected(p.south))parts.push(box(.125,1,.5,0,0,.25));if(connected(p.east))parts.push(box(.5,1,.125,.25,0,0));if(connected(p.west))parts.push(box(.5,1,.125,-.25,0,0));return merged(...parts)}
function wallGeometry(p:Record<string,string>){const parts:THREE.BufferGeometry[]=[];if(p.up!=='false')parts.push(box(.5,1.5,.5,0,.25,0));for(const [direction,value] of Object.entries({north:p.north,south:p.south,east:p.east,west:p.west})){if(!connected(value))continue;const tall=value==='tall',h=tall?1.5:1,y=tall ? .25 : 0;if(direction==='north')parts.push(box(.375,h,.5,0,y,-.25));if(direction==='south')parts.push(box(.375,h,.5,0,y,.25));if(direction==='east')parts.push(box(.5,h,.375,.25,y,0));if(direction==='west')parts.push(box(.5,h,.375,-.25,y,0))}return merged(...(parts.length?parts:[box(.5,1.5,.5,0,.25,0)]))}
function plantGeometry(){return merged(box(.06,.9,.9),box(.9,.9,.06))}
function cauldronGeometry(){return merged(box(1,.25,1,0,-.375,0),box(.125,.75,1,-.4375,.125,0),box(.125,.75,1,.4375,.125,0),box(.75,.75,.125,0,.125,-.4375),box(.75,.75,.125,0,.125,.4375))}

export function geometryKind(state:string){const n=blockName(state);if(n.endsWith('_slab'))return'slab';if(n.endsWith('_stairs'))return'stairs';if(n.endsWith('_fence_gate'))return'gate';if(n.endsWith('_fence')||n==='nether_brick_fence')return'fence';if(n.endsWith('_wall'))return'wall';if(n.endsWith('_pane')||n==='iron_bars')return'pane';if(n.endsWith('_trapdoor'))return'trapdoor';if(n.endsWith('_door'))return'door';if(n.includes('rail'))return'rail';if(n.endsWith('_carpet')||n==='moss_carpet')return'carpet';if(n==='snow')return'snow';if(n==='ladder')return'ladder';if(n.includes('torch'))return'torch';if(n.includes('sign'))return'sign';if(n.includes('cauldron'))return'cauldron';if(n.includes('chest'))return'chest';if(n.endsWith('_bed'))return'bed';if(n.includes('lantern'))return'lantern';if(n.includes('button'))return'button';if(n.includes('pressure_plate'))return'pressure_plate';if(n==='flower_pot'||n.endsWith('_flower_pot'))return'flower_pot';if(/flower|sapling|grass|fern|bush|mushroom|tulip|orchid|dandelion|poppy|lily|roots|seagrass|wheat|carrots|potatoes|beetroots|nether_wart|sugar_cane|bamboo|dead_bush/.test(n))return'plant';return'cube'}

export function geometryForBlock(state:string):THREE.BufferGeometry{
  const n=blockName(state),p=blockProperties(state),kind=geometryKind(state);
  if(kind==='slab'){if(p.type==='double')return box(1,1,1);return box(1,.5,1,0,p.type==='top' ? .25 : -.25,0)}
  if(kind==='stairs')return stairGeometry(p);
  if(kind==='gate')return gateGeometry(p);
  if(kind==='fence')return fenceGeometry(p);
  if(kind==='wall')return wallGeometry(p);
  if(kind==='pane')return paneGeometry(p);
  if(kind==='trapdoor'){if(p.open==='true')return oriented(box(1,1,.1875,0,0,-.40625),p.facing);return box(1,.1875,1,0,p.half==='top' ? .40625 : -.40625,0)}
  if(kind==='door'){let facing=p.facing??'north';if(p.open==='true'){const order=['north','east','south','west'],i=order.indexOf(facing),turn=p.hinge==='right'?1:3;facing=order[(i+turn)%4]}return oriented(box(1,1,.1875,0,0,-.40625),facing)}
  if(kind==='rail')return box(1,.0625,1,0,-.46875,0);
  if(kind==='carpet')return box(1,.0625,1,0,-.46875,0);
  if(kind==='snow'){const layers=Math.max(1,Math.min(8,Number(p.layers)||1)),h=layers/8;return box(1,h,1,0,-.5+h/2,0)}
  if(kind==='ladder')return oriented(box(1,1,.0625,0,0,-.46875),p.facing);
  if(kind==='plant')return plantGeometry();
  if(kind==='torch')return box(.125,.625,.125,0,-.1875,0);
  if(kind==='sign'){const wall=n.includes('wall_')||n.includes('wall_sign');return wall?oriented(box(1,.5,.125,0,.1,-.4375),p.facing):merged(box(.875,.5,.125,0,.15,0),box(.125,.5,.125,0,-.35,0))}
  if(kind==='cauldron')return cauldronGeometry();
  if(kind==='chest')return box(.875,.875,.875,0,-.0625,0);
  if(kind==='bed')return box(1,.5625,1,0,-.21875,0);
  if(kind==='lantern')return box(.375,.5,.375,0,p.hanging==='true' ? .25 : -.25,0);
  if(kind==='button')return oriented(box(.375,.25,.125,0,0,-.4375),p.facing);
  if(kind==='pressure_plate')return box(.875,.0625,.875,0,-.46875,0);
  if(kind==='flower_pot')return merged(box(.5,.125,.5,0,-.4375,0),box(.125,.375,.5,-.1875,-.25,0),box(.125,.375,.5,.1875,-.25,0),box(.25,.375,.125,0,-.25,-.1875),box(.25,.375,.125,0,-.25,.1875));
  return box(1,1,1);
}
