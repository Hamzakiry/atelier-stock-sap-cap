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
  console.error('CAP startup failed:',error.code||error.name);
  return {statusCode:503,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:{code:'503',message:'Service temporairement indisponible. Réessayer plus tard.'}})};
 }
}
