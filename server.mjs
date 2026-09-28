import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(root,'state.json');
const stars=()=>Array.from({length:18},(_,i)=>({id:i,x:Math.cos(i*2.4)*(11+i%3),z:Math.sin(i*2.4)*(11+i%3)}));
let state={orders:[],records:[],blocks:{},players:{},stars:stars()};
if(existsSync(file)){try{Object.assign(state,JSON.parse(readFileSync(file,'utf8')));state.players={}}catch(e){console.error('Cannot read state.json:',e.message);process.exit(1)}}
const clients=new Set();
const publicState=()=>({...state,orders:state.orders.map(({phone,...o})=>o)});
const snapshot=()=>JSON.stringify(publicState());
function save(){const data={...state,players:{}};writeFileSync(file+'.tmp',JSON.stringify(data));renameSync(file+'.tmp',file)}
function broadcast(){const msg='data: '+snapshot()+'\n\n';for(const r of clients)r.write(msg)}
const text=v=>typeof v==='string'?v.trim().slice(0,60):'';
function action({type,data:d,id}){if(!d||!id||typeof id!=='string'||id.length>100)throw Error('Invalid action');
if(type==='order'){if(!text(d.name)||!/^\+?[\d ()-]{10,22}$/.test(d.phone)||!['S','M','L'].includes(d.size))throw Error('Invalid order');const prices={'Багажник':12000,'Корзина':9500,'Крылья':8000,'Фара':6500,'Фляга':4500};const extras=[...new Set(Array.isArray(d.extras)?d.extras:[])].filter(k=>prices[k]);state.orders.unshift({name:text(d.name),phone:d.phone,size:d.size,frameColor:text(d.frameColor),rimColor:text(d.rimColor),extras,price:185000+(d.size==='L'?10000:d.size==='S'?-5000:0)+extras.reduce((s,k)=>s+prices[k],0),date:new Date().toISOString()});save()}
else if(type==='record'){if(!text(d.name)||!Number.isFinite(d.time)||d.time<3||d.time>3600)throw Error('Invalid record');state.records.push({name:text(d.name),time:d.time,date:new Date().toISOString()});state.records.sort((a,b)=>a.time-b.time);state.records=state.records.slice(0,100);save()}
else if(type==='block'){if(typeof d.key!=='string'||!/^(-?\d+),(-?\d+),(-?\d+)$/.test(d.key))throw Error('Invalid block');const[x,y,z]=d.key.split(',').map(Number);if(Math.abs(x)>20||Math.abs(z)>20||y< -2||y>16||!(d.type===null||Number.isInteger(d.type)&&d.type>=0&&d.type<=5))throw Error('Out of bounds');state.blocks[d.key]=d.type;save()}
else if(type==='player'){if(!['arena','voxel'].includes(d.game)||![d.x,d.z].every(Number.isFinite)||Math.abs(d.x)>25||Math.abs(d.z)>25)throw Error('Invalid player');state.players[id]={id,name:text(d.name).slice(0,20),game:d.game,color:/^#[0-9a-f]{6}$/i.test(d.color)?d.color:'#789abc',x:d.x,z:d.z,y:Number.isFinite(d.y)?d.y:0,yaw:Number.isFinite(d.yaw)?d.yaw:0,score:state.players[id]?.score||0,seen:Date.now()}}
else if(type==='star'){const p=state.players[id],i=state.stars.findIndex(s=>s.id===d.id);if(p?.game==='arena'&&i>=0&&Math.hypot(p.x-state.stars[i].x,p.z-state.stars[i].z)<1.2){state.stars.splice(i,1);p.score++;if(!state.stars.length)state.stars=stars()}}
else throw Error('Unknown action');
}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');
if(url.pathname==='/api/state'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(snapshot());return}
if(url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: '+snapshot()+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return}
if(url.pathname==='/api/action'&&req.method==='POST'){if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403);res.end();return}let body='';try{for await(const chunk of req){body+=chunk;if(body.length>12000)throw Error('Too large')}action(JSON.parse(body));broadcast();res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}')}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}return}
const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','bicycle.html','apartment.html','voxel.html','racing.html','arena.html'].includes(name)){res.writeHead(404);res.end('Not found');return}try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync(path.join(root,name)))}catch{res.writeHead(500);res.end('Unable to load page')}});
setInterval(()=>{let changed=false;for(const[id,p]of Object.entries(state.players))if(Date.now()-p.seen>12000){delete state.players[id];changed=true}if(changed)broadcast();for(const r of clients)r.write(': heartbeat\n\n')},5000).unref();
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Atelier: http://localhost:'+(process.env.PORT||3000)));
