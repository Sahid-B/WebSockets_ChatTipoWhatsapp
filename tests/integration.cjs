const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url='http://127.0.0.1:43190', fixture=path.join(__dirname,'stage2-fixture.json');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const clients=[];
async function connect(){const ws=new WebSocket(url.replace('http','ws')+'/ws'),events=[];clients.push(ws);ws.onmessage=e=>events.push(JSON.parse(e.data));await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});return {ws,events,send(type,payload={}){const requestId=crypto.randomUUID();ws.send(JSON.stringify({type,payload,requestId}));return requestId;},async wait(type,check=()=>true){for(let i=0;i<100;i++){const found=events.find(e=>e.type===type&&check(e));if(found)return found;await delay(20);}throw Error('Timeout '+type+' '+JSON.stringify(events));}};}
async function request(c,type,payload,response=type){const id=c.send(type,payload);return c.wait(response,e=>e.requestId===id);}
async function error(c,type,payload,code){const e=await request(c,type,payload,'error');assert.equal(e.code,code);}
(async()=>{try{
if(process.argv.includes('--restart')){
const saved=JSON.parse(fs.readFileSync(fixture,'utf8'));const a=await connect();const session=(await request(a,'session:join',{sessionToken:saved.token},'session:joined')).payload;assert.equal(session.user.id,saved.userId);assert.equal(session.room.id,saved.roomId);const h=(await a.wait('history:room')).payload.messages;assert.ok(h.some(m=>m.id===saved.replyId&&m.reply.deleted));const privateH=await request(a,'private:history',{otherId:saved.otherId},'history:private');assert.ok(privateH.payload.messages.some(m=>m.id===saved.privateId));await error(a,'message:edit',{messageId:saved.deletedId,content:'Revive'},'DELETED');console.log('PASS reinicio: identidad, sala, historial, cita eliminada y privados persistentes');
}else{
for(const p of ['/','/css/styles.css','/js/chat/chatController.js'])assert.equal((await fetch(url+p)).status,200);assert.equal((await fetch(url+'/server/data/chat-state.json')).status,404);console.log('PASS archivos estáticos y datos fuera del directorio público');
const a=await connect(),b=await connect(),c=await connect();
await error(c,'room:create',{name:'Intruso'},'NOT_IDENTIFIED');
const A=(await request(a,'session:join',{name:'Ana'},'session:joined')).payload;
const B=(await request(b,'session:join',{name:'Luis'},'session:joined')).payload;
const C=(await request(c,'session:join',{name:'Eva'},'session:joined')).payload;
await a.wait('users:list',e=>e.payload.count===3);await error(a,'session:join',{name:'Duplicado'},'ALREADY_JOINED');
const second=await connect();await error(second,'session:join',{sessionToken:A.sessionToken},'SESSION_IN_USE');second.ws.close();
console.log('PASS identificación, presencia, autorización y bloqueo de sesión simultánea');
const send={content:'Hola grupo',clientMessageId:crypto.randomUUID()};const m=(await request(a,'message:new',send,'message:ack')).payload.message;await b.wait('message:new',e=>e.payload.id===m.id);await c.wait('message:new',e=>e.payload.id===m.id);
const repeat=await request(a,'message:new',send,'message:ack');assert.equal(repeat.payload.message.id,m.id);assert.equal(repeat.payload.duplicate,true);await delay(50);assert.equal(b.events.filter(e=>e.type==='message:new'&&e.payload.id===m.id).length,1);
await error(a,'message:new',{...send,content:'Distinto'},'DUPLICATE_CONFLICT');
await error(b,'message:edit',{messageId:m.id,content:'Ajeno'},'FORBIDDEN');await error(b,'message:delete',{messageId:m.id},'FORBIDDEN');
console.log('PASS mensajes, deduplicación y permisos de autor');
const room=(await request(a,'room:create',{name:'Equipo'},'room:created')).payload.room;
await request(a,'room:join',{roomId:room.id},'room:joined');await request(b,'room:join',{roomId:room.id},'room:joined');
const roomMessage=(await request(a,'message:new',{content:'Solo equipo',clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;await b.wait('message:new',e=>e.payload.id===roomMessage.id);await delay(70);assert.ok(!c.events.some(e=>e.payload?.id===roomMessage.id));
await error(c,'message:edit',{messageId:roomMessage.id,content:'No'},'FORBIDDEN');
await error(a,'message:new',{content:'Cita otra sala',clientMessageId:crypto.randomUUID(),replyToId:m.id},'FORBIDDEN');
console.log('PASS crear/cambiar sala, aislamiento e historial autorizado');
const reply=(await request(b,'message:new',{content:'Respuesta',replyToId:roomMessage.id,clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;assert.equal(reply.reply.content,'Solo equipo');
a.send('message:edit',{messageId:roomMessage.id,content:'Texto actualizado'});await b.wait('message:edit',e=>e.payload.id===reply.id&&e.payload.reply.content==='Texto actualizado');
a.send('message:delete',{messageId:roomMessage.id});await b.wait('message:edit',e=>e.payload.id===reply.id&&e.payload.reply.deleted);console.log('PASS citas sincronizadas ante edición y eliminación');
const privateMessage=(await request(a,'message:private',{recipientId:B.user.id,content:'Secreto',clientMessageId:crypto.randomUUID()},'message:ack')).payload.message;await b.wait('message:private',e=>e.payload.id===privateMessage.id);await delay(70);assert.ok(!c.events.some(e=>e.payload?.id===privateMessage.id));await error(c,'message:delete',{messageId:privateMessage.id},'FORBIDDEN');
const ch=await request(c,'private:history',{otherId:A.user.id},'history:private');assert.equal(ch.payload.messages.length,0);
await error(a,'message:private',{recipientId:B.user.id,content:'Cita cruzada',replyToId:roomMessage.id,clientMessageId:crypto.randomUUID()},'INVALID_REPLY');
console.log('PASS privados y protección de contenido frente a terceros');
b.ws.close();await a.wait('users:list',e=>e.payload.users.some(u=>u.id===B.user.id&&!u.online&&u.lastDisconnectedAt));await error(a,'message:private',{recipientId:B.user.id,content:'Offline',clientMessageId:crypto.randomUUID()},'TARGET_OFFLINE');
const b2=await connect();const resumed=(await request(b2,'session:join',{sessionToken:B.sessionToken},'session:joined')).payload;assert.equal(resumed.user.id,B.user.id);assert.equal(resumed.room.id,room.id);console.log('PASS última conexión y recuperación de sesión/sala');
a.ws.send('{');await a.wait('error',e=>e.code==='INVALID_JSON');await error(a,'otro',{},'UNKNOWN_EVENT');await error(a,'session:join',{sessionToken:'mal'},'ALREADY_JOINED');console.log('PASS eventos inválidos controlados');
fs.writeFileSync(fixture,JSON.stringify({token:A.sessionToken,userId:A.user.id,roomId:room.id,otherId:B.user.id,privateId:privateMessage.id,replyId:reply.id,deletedId:roomMessage.id}));
}
}catch(e){console.error('FAIL',e.stack);process.exitCode=1;}finally{for(const ws of clients)ws.close();await delay(250);}})();
