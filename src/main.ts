import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readSchematic, type Schematic } from './nbt';
import { blockName as baseName, geometryForBlock } from './geometry';
import { colorFor } from './colors';

const app=document.querySelector<HTMLDivElement>('#app')!;
const thumbnailMode=new URLSearchParams(location.search).has('thumbnail');
if(thumbnailMode)document.documentElement.classList.add('thumbnail-mode');
app.innerHTML=`<canvas></canvas><header><div class="brand"><img src="./schemy-icon.png" alt=""><b>SCHEMY</b></div><div class="actions"><button id="textures" aria-pressed="false">Textures: Off</button><button id="open">Open structure</button></div></header><section id="empty"><img class="empty-logo" src="./schemy-icon.png" alt="Schemy"><h1>Drop a structure file</h1><p>.schematic, .schem, .nbt, or .litematic</p><button id="browse">Browse files</button></section><aside id="info"></aside><div id="error"></div>`;
const canvas=app.querySelector('canvas')!,empty=app.querySelector<HTMLElement>('#empty')!,info=app.querySelector<HTMLElement>('#info')!,error=app.querySelector<HTMLElement>('#error')!,textureButton=app.querySelector<HTMLButtonElement>('#textures')!;

const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101410);renderer.shadowMap.enabled=true;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,10000);camera.position.set(30,25,30);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.08;
scene.add(new THREE.HemisphereLight(0xddeeff,0x283020,2.2));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(30,50,20);scene.add(sun);
scene.add(new THREE.GridHelper(100,100,0x3d6344,0x253329));

let model:THREE.Group|undefined,current:Schematic|undefined,currentName='',textured=false;

function pixelTexture(state:string,color:number){
  const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d')!,rgb=new THREE.Color(color);let seed=0;for(const ch of state)seed=(seed*31+ch.charCodeAt(0))>>>0;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0xffffffff};
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){let shade=.78+rand()*.38;const n=baseName(state);if(n.includes('planks')&&(y%4===0||x===Math.floor(rand()*16)))shade*=.72;if(n.includes('brick')&&(y%4===0||x%8===(y%8<4?0:4)))shade*=.68;if(n.includes('log')&&(x%5===0))shade*=.72;if(n.includes('glass')&&(x===0||y===0||x===15||y===15||x===y))shade=1.2;ctx.fillStyle=`rgb(${Math.min(255,rgb.r*255*shade)},${Math.min(255,rgb.g*255*shade)},${Math.min(255,rgb.b*255*shade)})`;ctx.fillRect(x,y,1,1)}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapLinearFilter;return texture;
}

function materialFor(state:string){const color=colorFor(state),name=baseName(state),transparent=name.includes('glass')||name.includes('water')||name.includes('ice');return new THREE.MeshStandardMaterial({color:textured?0xffffff:color,map:textured?pixelTexture(state,color):null,roughness:.82,transparent,opacity:transparent?.68:1,depthWrite:!transparent})}

function renderModel(s:Schematic,name:string,resetCamera=true){
  if(model){scene.remove(model);model.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial)m.map?.dispose();m.dispose()})}})}
  model=new THREE.Group();const groups=new Map<number,number[]>();for(let i=0;i<s.states.length;i++){const state=s.states[i],block=s.palette[state]??'unknown:block';if(colorFor(block)===0)continue;let values=groups.get(state);if(!values){values=[];groups.set(state,values)}values.push(i)}
  const matrix=new THREE.Matrix4();for(const [state,indices] of groups){const block=s.palette[state]??'unknown:block',mesh=new THREE.InstancedMesh(geometryForBlock(block),materialFor(block),indices.length);indices.forEach((v,j)=>{const x=v%s.width,z=Math.floor(v/s.width)%s.length,y=Math.floor(v/(s.width*s.length));matrix.makeTranslation(x-s.width/2+.5,y+.5,z-s.length/2+.5);mesh.setMatrixAt(j,matrix)});model.add(mesh)}scene.add(model);
  empty.hidden=true;error.textContent='';info.innerHTML=`<b>${name}</b><span>${s.format}</span><span>${s.width} × ${s.height} × ${s.length}</span><span>${s.states.reduce((n,id)=>n+(colorFor(s.palette[id]??'')?1:0),0).toLocaleString()} blocks</span>`;
  if(resetCamera){const size=Math.max(s.width,s.height,s.length);controls.target.set(0,s.height/2,0);camera.position.set(size*1.3,size*.9,size*1.3);camera.near=Math.max(.01,size/1000);camera.far=size*20;camera.updateProjectionMatrix();controls.update()}
}

async function open(path?:string){try{path??=await window.schematic.chooseFile();if(!path)return;const f=await window.schematic.readFile(path);current=readSchematic(new Uint8Array(f.data));currentName=f.name;renderModel(current,currentName);if(thumbnailMode)requestAnimationFrame(()=>requestAnimationFrame(()=>window.schematic.thumbnailReady()))}catch(e){const message=e instanceof Error?e.message:String(e);error.textContent=message;if(thumbnailMode)window.schematic.thumbnailReady(message)}}
for(const id of ['open','browse'])app.querySelector(`#${id}`)?.addEventListener('click',()=>open());window.schematic.onOpenFile(open);
function setTextured(enabled:boolean){textured=enabled;textureButton.textContent=`Textures: ${textured?'On':'Off'}`;textureButton.setAttribute('aria-pressed',String(textured));window.schematic.setTextureState(textured);if(current)renderModel(current,currentName,false)}
textureButton.addEventListener('click',()=>setTextured(!textured));window.schematic.onTextureMode(setTextured);
addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f){const path=window.schematic.pathForFile(f);if(/\.(schematic|schem|nbt|litematic)$/i.test(path))open(path);else error.textContent='Please drop a .schematic, .schem, .nbt, or .litematic file'}});
function frame(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();controls.update();renderer.render(scene,camera);requestAnimationFrame(frame)}frame();
