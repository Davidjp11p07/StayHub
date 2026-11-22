// Run against a local demo installation with OWNER, GUEST and VERIFIER test credentials.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.STAYHUB_WEB_URL || 'https://localhost:38443';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local demo required');
const credentials = role => ({
  email:process.env['STAYHUB_'+role+'_EMAIL'], password:process.env['STAYHUB_'+role+'_PASSWORD']
});
(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    async function api(method,path,token,data,extra={}) {
      const response=await context.request.fetch(base+'/api/v1'+path,{method,data,headers:token?{Authorization:'Bearer '+token}:{},...extra});
      assert(response.ok(),method+' '+path+' '+response.status());
      return response.json();
    }
    async function login(role) {
      const page=await browser.newPage({ignoreHTTPSErrors:true});
      const user=credentials(role);
      await page.goto(base+'/login');await page.locator('#email').fill(user.email);await page.locator('#password').fill(user.password);
      await page.locator('form button[type=submit]').click();await page.waitForURL(u=>u.pathname!='/login');
      return page;
    }
    const owner=(await api('POST','/auth/login',null,credentials('OWNER'))).accessToken;
    const verifier=(await api('POST','/auth/login',null,credentials('VERIFIER'))).accessToken;
    const guest=(await api('POST','/auth/login',null,credentials('GUEST'))).accessToken;
    const property=await api('POST','/properties',owner,{
      type:'HOUSE',name:'Prueba de retiro '+Date.now(),description:'Inmueble sintético para comprobar el retiro con reserva vigente.',
      location:{addressLine:'Calle de prueba 1',city:'Bogotá',region:'Bogotá',country:'CO'},
      rooms:[{name:'Habitación de prueba',capacity:2,basePrice:{amount:'120000.00',currency:'COP'}}]
    });
    const path='/properties/'+property.id;
    await api('POST',path+'/photos',owner,undefined,{multipart:{file:{name:'demo.png',mimeType:'image/png',buffer:require('node:fs').readFileSync(require.resolve('../assets/demo-photos/070021.png'))}}});
    const {version}=await api('GET',path,owner);
    await api('POST',path+'/verification',owner,{version});
    await api('POST',path+'/verification/decision',verifier,{version,status:'APPROVED',reason:'Prueba local del comprobante'});
    const g=await login('GUEST'), h=await login('OWNER');
    const day=i=>new Date(Date.now()+i*86400000).toISOString().slice(0,10);
    await g.goto(base+'/property/'+property.id+'/book');
    await g.locator('#booking-check-in').fill(day(30));await g.locator('#booking-check-out').fill(day(32));
    await g.getByRole('button',{name:'Confirmar reserva'}).click();
    await g.waitForURL('**/booking/*/pay');const id=new URL(g.url()).pathname.split('/')[2];
    await g.getByText('Tu reserva ya está confirmada.').waitFor({timeout:90000});
    const snapshot=await api('GET','/bookings/'+id,guest);
    assert.equal(snapshot.paymentStatus,'CAPTURED');
    const receipt=base+'/stay/'+id;
    await g.goto(receipt);await g.getByRole('button',{name:'Imprimir comprobante'}).waitFor();
    await h.goto(base+'/host/properties/'+property.id+'/edit');
    await h.getByRole('button',{name:'Despublicar y guardar cambios'}).click();
    await h.getByText('1 reserva activa o futura seguirá vigente.').waitFor();
    await h.getByRole('button',{name:'Despublicar y mantener reservas'}).click();
    await h.waitForURL('**/property/'+property.id);
    assert.equal((await api('GET',path,owner)).status,'UNPUBLISHED');
    assert.equal((await context.request.get(base+'/api/v1'+path)).status(),404);
    const after=await api('GET','/bookings/'+id,guest);
    for(const field of ['id','status','paymentStatus','total','checkIn','checkOut','roomName','propertyName'])assert.deepEqual(after[field],snapshot[field]);
    await g.goto(base+'/bookings');await g.locator('li').filter({hasText:property.name}).getByText('Ver comprobante').click();
    assert.equal(g.url(),receipt);
    await g.getByLabel('Mensaje',{exact:true}).fill('¿Dónde recogemos las llaves?');await g.getByRole('button',{name:'Enviar mensaje'}).click();
    await h.goto(receipt);await h.getByText('¿Dónde recogemos las llaves?',{exact:true}).waitFor();
    await h.getByLabel('Mensaje',{exact:true}).fill('En recepción.');await h.getByRole('button',{name:'Enviar mensaje'}).click();
    await g.reload();await g.getByText('En recepción.',{exact:true}).waitFor();
    const outsider={email:'receipt-test-'+crypto.randomUUID()+'@stayhub.test',password:'Test-'+crypto.randomUUID()};
    await api('POST','/auth/register',null,{...outsider,name:'Huésped de prueba',role:'GUEST'},
      {headers:{'Idempotency-Key':crypto.randomUUID()}});
    const outsiderToken=(await api('POST','/auth/login',null,outsider)).accessToken;
    const thread=base+'/api/v1/bookings/'+id+'/messages';
    const headers={Authorization:'Bearer '+outsiderToken};
    assert.equal((await context.request.get(thread,{headers})).status(),404);
    assert.equal((await context.request.post(thread,{headers,data:{id:crypto.randomUUID(),body:'Prueba de privacidad'}})).status(),404);
    console.log('Reserva confirmada, inmueble retirado, comprobante conservado y mensajes en ambos sentidos.',property.id,id);
  } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
