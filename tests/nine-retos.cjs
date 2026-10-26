const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url='http://127.0.0.1:43190',fixture=path.join(__dirname,'nine-fixture.json');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),clients=[];
async function connect(){const ws=new WebSocket(url.replace('http','ws')+'/ws'),events=[];clients.push(ws);ws.onmessage=e=>events.push(JSON.parse(e.data));await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});return {ws,events,send(type,payload={}){const requestId=crypto.randomUUID();ws.send(JSON.stringify({type,payload,requestId}));return requestId;},async wait(type,check=()=>true){for(let i=0;i<250;i++){const found=events.find(e=>e.type===type&&check(e));if(found)return found;await delay(20);}throw Error('Timeout '+type+' '+JSON.stringify(events));}};}
async function request(c,type,payload,response=type){const id=c.send(type,payload);return c.wait(response,e=>e.requestId===id);}
async function error(c,type,payload,code){assert.equal((await request(c,type,payload,'error')).code,code);}
async function joined(c,name){return(await request(c,'session:join',{name},'session:joined')).payload;}
(async()=>{try{
if(process.argv.includes('--restart')){
const f=JSON.parse(fs.readFileSync(fixture,'utf8')),a=await connect();await request(a,'session:join',{sessionToken:f.token},'session:joined');const h=await a.wait('history:room');const m=h.payload.messages.find(m=>m.id===f.messageId);assert.deepEqual(m.reactions['❤️'],[f.otherId]);assert.ok(m.delivery.readBy.includes(f.otherId));console.log('PASS persistencia de reacciones y confirmaciones tras reinicio');
}else{
const a=await connect(),b=await connect(),c=await connect();const A=await joined(a,'Reto Ana'),B=await joined(b,'Reto Luis'),C=await joined(c,'Reto Eva');
const markB=b.events.length,markC=c.events.length;
a.send('typing:start',{conversationType:'room'});await b.wait('typing:start',e=>e.payload.userId===A.user.id);await c.wait('typing:start',e=>e.payload.userId===A.user.id);
for(let i=0;i<10;i++)a.send('typing:start',{conversationType:'room'});await delay(100);assert.equal(b.events.slice(markB).filter(e=>e.type==='typing:start').length,1);
await b.wait('typing:stop',e=>e.payload.userId===A.user.id);console.log('PASS Reto 1: escritura grupal, límite de frecuencia y expiración');
const privateStart=c.events.length;a.send('typing:start',{conversationType:'private',otherId:B.user.id});await b.wait('typing:start',e=>e.payload.conversationType==='private');await delay(80);assert.ok(!c.events.slice(privateStart).some(e=>e.type==='typing:start'));a.send('typing:stop');await b.wait('typing:stop',e=>e.payload.conversationType==='private');
console.log('PASS Reto 1: escritura privada aislada');
const m=(await request(a,'message:new',{content:'Confirmaciones reales',clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;
assert.deepEqual(m.delivery.expected.sort(),[B.user.id,C.user.id].sort());assert.deepEqual(m.delivery.receivedBy,[]);assert.deepEqual(m.delivery.readBy,[]);
await request(b,'receipt:mark',{messageId:m.id,receiptType:'received'},'receipt:ack');const received=await a.wait('receipt:update',e=>e.payload.id===m.id&&e.payload.delivery.receivedBy.includes(B.user.id));assert.equal(received.payload.delivery.readBy.length,0);
await request(b,'receipt:mark',{messageId:m.id,receiptType:'read'},'receipt:ack');await a.wait('receipt:update',e=>e.payload.id===m.id&&e.payload.delivery.readBy.includes(B.user.id));
await request(b,'receipt:mark',{messageId:m.id,receiptType:'read'},'receipt:ack');const stored=await request(a,'history:room',{},'history:room');assert.equal(stored.payload.messages.find(x=>x.id===m.id).delivery.readBy.length,1);
await error(a,'receipt:mark',{messageId:m.id,receiptType:'read'},'NOT_RECIPIENT');
const d=await connect();await joined(d,'Llegó después');await error(d,'receipt:mark',{messageId:m.id,receiptType:'read'},'NOT_RECIPIENT');console.log('PASS Reto 2: enviado/recibido/leído, idempotencia y destinatarios congelados');
await request(b,'reaction:add',{messageId:m.id,emoji:'👍'},'reaction:ack');await a.wait('reaction:update',e=>e.payload.id===m.id&&e.payload.reactions['👍']?.includes(B.user.id));
await request(b,'reaction:add',{messageId:m.id,emoji:'👍'},'reaction:ack');await a.wait('reaction:update',e=>e.payload.id===m.id&&!e.payload.reactions['👍']);
await request(b,'reaction:add',{messageId:m.id,emoji:'❤️'},'reaction:ack');await error(c,'reaction:add',{messageId:m.id,emoji:'INVALID'},'INVALID_EMOJI');console.log('PASS Reto 3: agregar/quitar reacciones sin duplicados y emoji validado');
const room=(await request(c,'room:create',{name:'Sala aislada RT'},'room:created')).payload.room;await request(c,'room:join',{roomId:room.id},'room:joined');await error(c,'reaction:add',{messageId:m.id,emoji:'😂'},'FORBIDDEN');await error(c,'receipt:mark',{messageId:m.id,receiptType:'received'},'FORBIDDEN');
const ci=c.events.length;a.send('typing:start',{conversationType:'room'});await delay(100);assert.ok(!c.events.slice(ci).some(e=>e.type==='typing:start'));a.send('typing:stop');
const pm=(await request(a,'message:private',{recipientId:B.user.id,content:'Privado con estados',clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;const privC=c.events.length;
await request(b,'reaction:add',{messageId:pm.id,emoji:'😂'},'reaction:ack');await request(b,'receipt:mark',{messageId:pm.id,receiptType:'read'},'receipt:ack');await delay(80);assert.ok(!c.events.slice(privC).some(e=>['reaction:update','receipt:update'].includes(e.type)&&e.payload.id===pm.id));await error(c,'reaction:add',{messageId:pm.id,emoji:'👍'},'FORBIDDEN');await error(c,'receipt:mark',{messageId:pm.id,receiptType:'read'},'FORBIDDEN');
console.log('PASS Retos 1–3: aislamiento por salas y privacidad frente a terceros');
const transient=(await request(a,'message:new',{content:'Borrar reacción',clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;await request(b,'reaction:add',{messageId:transient.id,emoji:'😂'},'reaction:ack');a.send('message:delete',{messageId:transient.id});await b.wait('message:delete',e=>e.payload.id===transient.id);await error(b,'reaction:add',{messageId:transient.id,emoji:'😂'},'DELETED');
const before=b.events.length;a.send('typing:start',{conversationType:'room'});await b.wait('typing:start',e=>e.payload.userId===A.user.id);a.ws.close();await b.wait('typing:stop',e=>e.payload.userId===A.user.id);await b.wait('user:left',e=>e.payload.id===A.user.id);console.log('PASS eliminación bloquea nuevas reacciones; desconexión limpia escritura');
fs.writeFileSync(fixture,JSON.stringify({token:A.sessionToken,messageId:m.id,otherId:B.user.id}));
}
}catch(e){console.error('FAIL',e.stack);process.exitCode=1;}finally{for(const ws of clients)ws.close();await delay(250);}})();
