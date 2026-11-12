import cds from '@sap/cds';
import express from 'express';
import {configureWebDatabase} from './config.js';
let initialized;
export function getWebApp(){
 if(!initialized)initialized=(async()=>{
  configureWebDatabase();
  const app=express();cds.app=app;
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  cds.model=cds.compile.for.nodejs(await cds.load(['db','srv']));
  cds.db=await cds.connect.to('db');
  await cds.serve('CatalogService').in(app);
  return app;
 })().catch(error=>{initialized=null;throw error;});
 return initialized;
}
