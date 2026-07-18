import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readClassicSchematic, type Schematic } from './nbt';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<canvas></canvas><header><div class="brand"><b>SCHEMATIC</b><span>VIEWER</span></div><button id="open">Open schematic</button></header><section id="empty"><div class="cube">◇</div><h1>Drop a .schematic file</h1><p>or open one to inspect it in 3D</p><button id="browse">Browse files</button></section><aside id="info"></aside><div id="error"></div>`;
const canvas=app.querySelector('canvas')!,empty=app.querySelector<HTMLElement>('#empty')!,info=app.querySelector<HTMLElement>('#info')!,error=app.querySelector<HTMLElement>('#error')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101410);renderer.shadowMap.enabled=true;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,10000);camera.position.set(30,25,30);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.08;
scene.add(new THREE.HemisphereLight(0xddeeff,0x283020,2.2));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(30,50,20);scene.add(sun);
const grid=new THREE.GridHelper(100,100,0x3d6344,0x253329);scene.add(grid);let model:THREE.Group|undefined;
const colors:Record<number,number>={1:0x8c8c8c,2:0x60913b,3:0x79563a,4:0x777777,5:0xb88a55,7:0x333333,8:0x377dba,9:0x377dba,12:0xdac68b,13:0x8a806e,17:0x715236,18:0x3d713a,20:0xb9d7df,24:0xd4bd78,35:0xd8d8d8,41:0xf4cf42,42:0xbfc3c4,45:0x9d4d36,49:0x312244,79:0xa9d7e8,80:0xf5f5f5,87:0x74352d,89:0xd6b84c,98:0x777777};
function show(s:Schematic,name:string){if(model)scene.remove(model);model=new THREE.Group();const groups=new Map<number,number[]>();for(let i=0;i<s.blocks.length;i++){const id=s.blocks[i];if(!id)continue;(groups.get(id)??(groups.set(id,[]),groups.get(id)!)).push(i)}
 const geo=new THREE.BoxGeometry(1,1,1),m=new THREE.Matrix4();for(const [id,indices] of groups){const mesh=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:colors[id]??0xbd63b8,roughness:.8}),indices.length);indices.forEach((v,j)=>{const x=v%s.width,z=Math.floor(v/s.width)%s.length,y=Math.floor(v/(s.width*s.length));m.makeTranslation(x-s.width/2+.5,y+.5,z-s.length/2+.5);mesh.setMatrixAt(j,m)});model.add(mesh)}scene.add(model);empty.hidden=true;error.textContent='';info.innerHTML=`<b>${name}</b><span>${s.width} × ${s.height} × ${s.length}</span><span>${s.blocks.reduce((n,b)=>n+(b?1:0),0).toLocaleString()} blocks</span>`;const size=Math.max(s.width,s.height,s.length);controls.target.set(0,s.height/2,0);camera.position.set(size*1.3,size*.9,size*1.3);camera.near=Math.max(.01,size/1000);camera.far=size*20;camera.updateProjectionMatrix();controls.update()}
async function open(path?:string){try{path??=await window.schematic.chooseFile();if(!path)return;const f=await window.schematic.readFile(path);show(readClassicSchematic(new Uint8Array(f.data)),f.name)}catch(e){error.textContent=e instanceof Error?e.message:String(e)}}
for(const id of ['open','browse'])app.querySelector(`#${id}`)?.addEventListener('click',()=>open());window.schematic.onOpenFile(open);
addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f){const path=window.schematic.pathForFile(f);if(path.toLowerCase().endsWith('.schematic'))open(path);else error.textContent='Please drop a .schematic file'}});
function frame(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();controls.update();renderer.render(scene,camera);requestAnimationFrame(frame)}frame();
