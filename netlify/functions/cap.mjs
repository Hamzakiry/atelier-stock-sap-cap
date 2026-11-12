import serverless from 'serverless-http';
import {getWebApp} from '../../web/app.js';
let handlerPromise;
export async function handler(event,context){
 context.callbackWaitsForEmptyEventLoop=false;
 try{
  handlerPromise??=getWebApp().then(app=>serverless(app)).catch(error=>{handlerPromise=null;throw error;});
  const app=await handlerPromise;
  event.path=(event.path||'/').replace(/^\/\.netlify\/functions\/cap/,'')||'/';
  return await app(event,context);
 }catch(error){
  console.error('CAP startup failed:', (error.stack || error.name).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]').replace(/npg_[A-Za-z0-9]+/g,'[redacted]'));
  return {statusCode:503,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:{code:'503',message:'Service temporairement indisponible. Réessayer plus tard.'}})};
 }
}

// Netlify's native Request/Response entry point keeps this function in ESM format.
export default async function netlifyHandler(request) {
 const url=new URL(request.url);
 const result=await handler({
  httpMethod:request.method,path:url.pathname,rawUrl:request.url,
  headers:Object.fromEntries(request.headers),
  queryStringParameters:Object.fromEntries(url.searchParams),
  body:['GET','HEAD'].includes(request.method)?null:await request.text(),
  isBase64Encoded:false
 },{});
 return new Response(result.body? (result.isBase64Encoded?Buffer.from(result.body,'base64'):result.body):null,
  {status:result.statusCode,headers:result.headers});
}
